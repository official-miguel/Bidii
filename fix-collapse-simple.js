// Simple approach: Just return slots as-is but add group metadata based on co-scheduled subjects
// This treats each group instance individually by analyzing what subjects appear together

const fs = require('fs');
const path = './src/lib/timetable/engineHelpers.ts';

// Read the current file
let content = fs.readFileSync(path, 'utf8');

// Find the collapse function and replace it completely
const functionStart = content.indexOf('export function collapseGroupSlotsForDisplay<');
const functionEnd = content.indexOf('\n}\n\n/**', functionStart) + 2;

if (functionStart === -1 || functionEnd === -1) {
  console.error('Could not find the collapse function boundaries');
  process.exit(1);
}

const newFunction = `export function collapseGroupSlotsForDisplay<
  T extends {
    classId: string;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    internalCode: number;
    room: string | null;
  }
>(
  slots: T[],
  groupDescriptors: GroupPayloadDescriptor[]
): Array<
  T & {
    isGroupAnchor?: boolean;
    groupName?: string;
    groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
    allTeachers?: string[];
  }
> {
  console.log(\`🔍 COLLAPSE DEBUG: Processing \${slots.length} slots with simple approach\`);

  // Group slots by time (class + day + period)
  const timeGroups = new Map<string, T[]>();
  for (const slot of slots) {
    const timeKey = \`\${slot.classId}:\${slot.dayOfWeek}:\${slot.period}\`;
    if (!timeGroups.has(timeKey)) {
      timeGroups.set(timeKey, []);
    }
    timeGroups.get(timeKey)!.push(slot);
  }

  console.log(\`🔍 COLLAPSE DEBUG: Found \${timeGroups.size} unique time periods\`);

  const result: Array<T & {
    isGroupAnchor?: boolean;
    groupName?: string;
    groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
    allTeachers?: string[];
  }> = [];

  const processedSlots = new Set<string>(); // Track which slots we've already included

  for (const [timeKey, slotsAtTime] of timeGroups) {
    console.log(\`\\n🔍 COLLAPSE DEBUG: Analyzing \${timeKey} with \${slotsAtTime.length} slots: \${slotsAtTime.map(s => s.subjectCode).join(', ')}\`);
    
    if (slotsAtTime.length === 1) {
      // Single slot - add as-is
      const slot = slotsAtTime[0];
      if (!processedSlots.has(slot.id)) {
        result.push(slot);
        processedSlots.add(slot.id);
        console.log(\`   Added single slot: \${slot.subjectCode}\`);
      }
    } else {
      // Multiple slots at same time - try to identify groups
      
      // For each group descriptor, check if this time slot contains those subjects
      for (const group of groupDescriptors) {
        const groupSubjectIds = new Set(group.subjectIds);
        const matchingSlots = slotsAtTime.filter(s => groupSubjectIds.has(s.subjectId));
        
        if (matchingSlots.length >= 2) {
          // Found a group with multiple subjects at this time
          console.log(\`   Found group \${group.name} with \${matchingSlots.length} subjects\`);
          
          // Find the anchor (first subject in the group definition)
          const anchorSlot = matchingSlots.find(s => s.subjectId === group.subjectIds[0]);
          
          if (anchorSlot && !processedSlots.has(anchorSlot.id)) {
            const groupMembers = matchingSlots.map(s => ({
              subjectId: s.subjectId,
              subjectCode: s.subjectCode,
              subjectName: s.subjectName,
            }));
            
            const allTeachers = [...new Set(matchingSlots.map(s => s.teacherName))];
            
            // Add the group entry
            result.push({
              ...anchorSlot,
              isGroupAnchor: true,
              groupName: group.name,
              groupMembers,
              allTeachers,
            });
            
            // Mark all matching slots as processed
            for (const slot of matchingSlots) {
              processedSlots.add(slot.id);
            }
            
            console.log(\`     Created group entry: 📦 \${group.name} with \${groupMembers.length} members\`);
          }
        }
      }
      
      // Add any remaining unprocessed slots as individual subjects
      for (const slot of slotsAtTime) {
        if (!processedSlots.has(slot.id)) {
          result.push(slot);
          processedSlots.add(slot.id);
          console.log(\`   Added individual slot: \${slot.subjectCode}\`);
        }
      }
    }
  }

  console.log(\`🔍 COLLAPSE DEBUG: Final result has \${result.length} entries\`);
  const groupEntries = result.filter(r => r.isGroupAnchor);
  console.log(\`   Group entries: \${groupEntries.map(g => g.groupName).join(', ')}\`);

  return result;
}`;

// Replace the function
const newContent = content.substring(0, functionStart) + newFunction + content.substring(functionEnd);

// Write back to file
fs.writeFileSync(path, newContent);
console.log('✅ Updated collapse function with simple approach');