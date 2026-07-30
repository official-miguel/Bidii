/**
 * src/lib/timetable/streamBalancer.ts
 *
 * Stream population balancing for selective/elective subjects.
 * Ensures no stream becomes significantly larger than another unless
 * manually approved by an admin.
 */

export type StreamStudent = {
  studentId: string;
  name: string;
  currentClassId: string;
  currentClassName: string;
};

export type StreamOption = {
  classId: string;
  className: string;
  stream: string;
  currentCount: number;
  capacity: number;
};

export type BalancingResult = {
  balanced: boolean;
  streams: StreamOption[];
  warnings: string[];
  recommendations: Array<{
    action: "MOVE" | "REDISTRIBUTE";
    description: string;
    fromStream?: string;
    toStream?: string;
    studentCount?: number;
  }>;
  requiresApproval: boolean;
};

export type BalancingConfig = {
  /** Maximum allowed difference in stream sizes (absolute number) */
  maxAbsoluteDifference: number;
  /** Maximum allowed difference as percentage of average (0-1) */
  maxPercentageDifference: number;
  /** Minimum stream size before triggering warnings */
  minStreamSize: number;
  /** Maximum stream size before triggering warnings */
  maxStreamSize: number;
};

const DEFAULT_CONFIG: BalancingConfig = {
  maxAbsoluteDifference: 5,
  maxPercentageDifference: 0.2, // 20%
  minStreamSize: 10,
  maxStreamSize: 50,
};

/**
 * Analyze stream balance for a subject across multiple streams
 */
export function analyzeStreamBalance(
  subject: { id: string; code: string; name: string },
  streams: StreamOption[],
  students: StreamStudent[],
  config: BalancingConfig = DEFAULT_CONFIG
): BalancingResult {
  const warnings: string[] = [];
  const recommendations: BalancingResult["recommendations"] = [];

  if (streams.length === 0) {
    return {
      balanced: true,
      streams: [],
      warnings: [],
      recommendations: [],
      requiresApproval: false,
    };
  }

  // Calculate statistics
  const streamCounts = streams.map((s) => s.currentCount);
  const totalStudents = streamCounts.reduce((sum, count) => sum + count, 0);
  const averageSize = totalStudents / streams.length;
  const minSize = Math.min(...streamCounts);
  const maxSize = Math.max(...streamCounts);
  const difference = maxSize - minSize;

  let balanced = true;
  let requiresApproval = false;

  // Check absolute difference
  if (difference > config.maxAbsoluteDifference) {
    balanced = false;
    warnings.push(
      `Stream sizes vary by ${difference} students (max allowed: ${config.maxAbsoluteDifference})`
    );

    // Find over-populated and under-populated streams
    const largeStreams = streams.filter((s) => s.currentCount > averageSize + config.maxAbsoluteDifference / 2);
    const smallStreams = streams.filter((s) => s.currentCount < averageSize - config.maxAbsoluteDifference / 2);

    if (largeStreams.length > 0 && smallStreams.length > 0) {
      recommendations.push({
        action: "REDISTRIBUTE",
        description: `Move ${Math.ceil(difference / 2)} students from ${largeStreams.map((s) => s.stream).join(", ")} to ${smallStreams.map((s) => s.stream).join(", ")}`,
        fromStream: largeStreams[0].stream,
        toStream: smallStreams[0].stream,
        studentCount: Math.ceil(difference / 2),
      });
      requiresApproval = true;
    }
  }

  // Check percentage difference
  if (averageSize > 0) {
    const percentDiff = difference / averageSize;
    if (percentDiff > config.maxPercentageDifference) {
      balanced = false;
      warnings.push(
        `Stream size difference is ${Math.round(percentDiff * 100)}% (max allowed: ${Math.round(config.maxPercentageDifference * 100)}%)`
      );
    }
  }

  // Check minimum stream size
  if (minSize < config.minStreamSize && minSize > 0) {
    warnings.push(
      `Stream "${streams.find((s) => s.currentCount === minSize)?.stream}" has only ${minSize} students (minimum recommended: ${config.minStreamSize})`
    );
    requiresApproval = true;
  }

  // Check maximum stream size
  if (maxSize > config.maxStreamSize) {
    warnings.push(
      `Stream "${streams.find((s) => s.currentCount === maxSize)?.stream}" has ${maxSize} students (maximum recommended: ${config.maxStreamSize})`
    );
    requiresApproval = true;
  }

  // Check for empty streams
  const emptyStreams = streams.filter((s) => s.currentCount === 0);
  if (emptyStreams.length > 0 && totalStudents > 0) {
    warnings.push(
      `${emptyStreams.length} stream(s) have no students: ${emptyStreams.map((s) => s.stream).join(", ")}`
    );
    recommendations.push({
      action: "REDISTRIBUTE",
      description: `Distribute students into empty streams: ${emptyStreams.map((s) => s.stream).join(", ")}`,
    });
  }

  return {
    balanced,
    streams: streams.map((s) => ({
      ...s,
      currentCount: s.currentCount,
    })),
    warnings,
    recommendations,
    requiresApproval,
  };
}

/**
 * Suggest optimal stream assignments for students
 */
export function suggestStreamAssignments(
  students: StreamStudent[],
  streams: StreamOption[],
  config: BalancingConfig = DEFAULT_CONFIG
): Map<string, string> {
  // Create assignments map: studentId -> classId
  const assignments = new Map<string, string>();

  if (streams.length === 0) return assignments;

  // Sort streams by current count (ascending)
  const sortedStreams = [...streams].sort((a, b) => a.currentCount - b.currentCount);

  // Calculate target size per stream
  const targetSize = Math.ceil(students.length / streams.length);

  // Track current counts
  const streamCounts = new Map<string, number>();
  for (const stream of streams) {
    streamCounts.set(stream.classId, stream.currentCount);
  }

  // Assign students to streams round-robin, preferring smaller streams
  for (const student of students) {
    // Find stream with lowest current count that hasn't reached capacity
    let targetStream: StreamOption | null = null;
    let minCount = Infinity;

    for (const stream of sortedStreams) {
      const currentCount = streamCounts.get(stream.classId) ?? 0;
      if (currentCount < stream.capacity && currentCount < minCount) {
        minCount = currentCount;
        targetStream = stream;
      }
    }

    if (targetStream) {
      assignments.set(student.studentId, targetStream.classId);
      streamCounts.set(
        targetStream.classId,
        (streamCounts.get(targetStream.classId) ?? 0) + 1
      );
    }
  }

  return assignments;
}

/**
 * Calculate rebalancing moves required
 */
export function calculateRebalancingMoves(
  currentAssignments: Map<string, string>, // studentId -> classId
  students: StreamStudent[],
  streams: StreamOption[],
  config: BalancingConfig = DEFAULT_CONFIG
): Array<{
  studentId: string;
  studentName: string;
  fromClassId: string;
  toClassId: string;
  reason: string;
}> {
  const moves: Array<{
    studentId: string;
    studentName: string;
    fromClassId: string;
    toClassId: string;
    reason: string;
  }> = [];

  if (streams.length === 0) return moves;

  // Calculate current stream sizes
  const streamSizes = new Map<string, number>();
  for (const stream of streams) {
    streamSizes.set(stream.classId, 0);
  }
  for (const [studentId, classId] of currentAssignments) {
    streamSizes.set(classId, (streamSizes.get(classId) ?? 0) + 1);
  }

  // Calculate target size
  const totalStudents = students.length;
  const targetSize = Math.floor(totalStudents / streams.length);
  const remainder = totalStudents % streams.length;

  // Determine target sizes (some streams get +1 if there's a remainder)
  const targetSizes = new Map<string, number>();
  streams.forEach((stream, index) => {
    targetSizes.set(stream.classId, targetSize + (index < remainder ? 1 : 0));
  });

  // Find over and under populated streams
  const overPopulated: string[] = [];
  const underPopulated: string[] = [];

  for (const stream of streams) {
    const current = streamSizes.get(stream.classId) ?? 0;
    const target = targetSizes.get(stream.classId) ?? targetSize;

    if (current > target) {
      overPopulated.push(stream.classId);
    } else if (current < target) {
      underPopulated.push(stream.classId);
    }
  }

  // Create moves from over-populated to under-populated
  for (const fromClassId of overPopulated) {
    const current = streamSizes.get(fromClassId) ?? 0;
    const target = targetSizes.get(fromClassId) ?? targetSize;
    let excess = current - target;

    // Find students in this stream
    const studentsInStream = students.filter(
      (s) => currentAssignments.get(s.studentId) === fromClassId
    );

    for (const student of studentsInStream) {
      if (excess <= 0) break;

      // Find an under-populated stream
      const toClassId = underPopulated.find((classId) => {
        const current = streamSizes.get(classId) ?? 0;
        const target = targetSizes.get(classId) ?? targetSize;
        return current < target;
      });

      if (toClassId) {
        const fromStream = streams.find((s) => s.classId === fromClassId);
        const toStream = streams.find((s) => s.classId === toClassId);

        moves.push({
          studentId: student.studentId,
          studentName: student.name,
          fromClassId,
          toClassId,
          reason: `Balance streams: ${fromStream?.stream} (${current}) → ${toStream?.stream} (${streamSizes.get(toClassId)})`,
        });

        // Update counts
        streamSizes.set(fromClassId, (streamSizes.get(fromClassId) ?? 0) - 1);
        streamSizes.set(toClassId, (streamSizes.get(toClassId) ?? 0) + 1);
        excess--;
      }
    }
  }

  return moves;
}

/**
 * Validate stream balance approval
 */
export function validateStreamApproval(
  approval: {
    approved: boolean;
    approvedById: string;
    approvedAt: Date;
    notes?: string;
  },
  balance: BalancingResult
): { valid: boolean; reason?: string } {
  if (!balance.requiresApproval) {
    return { valid: true };
  }

  if (!approval.approved) {
    return { valid: false, reason: "Stream balance requires admin approval" };
  }

  if (!approval.approvedById) {
    return { valid: false, reason: "Approval must include approver ID" };
  }

  return { valid: true };
}
