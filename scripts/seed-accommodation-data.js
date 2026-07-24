/**
 * Optimized seed: bulk inserts for beds and positions.
 * Run: node scripts/seed-accommodation-data.js
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const SCHOOL_ID = "cmrj17f4m0007vbnognq81682";

function cuid() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return "c" + ts + rand;
}

async function main() {
  console.log("🏠 Seeding accommodation data...\n");

  // ── Fetch students ──────────────────────────────────────────────────
  const students = await p.student.findMany({
    where: { schoolId: SCHOOL_ID },
    take: 60,
    select: {
      id: true,
      schoolClass: { select: { form: true } },
    },
    orderBy: [{ schoolClass: { form: "asc" } }, { fullName: "asc" }],
  });
  console.log(`Found ${students.length} students`);

  // ── Add beds to dorms that don't have them yet ──────────────────────
  const dorms = await p.dormitory.findMany({
    where: { schoolId: SCHOOL_ID },
    include: { permittedForms: true },
  });

  for (const dorm of dorms) {
    const bedCount = await p.bed.count({ where: { dormId: dorm.id } });
    if (bedCount > 0) {
      const cap = await p.sleepingPosition.count({ where: { dormId: dorm.id } });
      await p.dormitory.update({ where: { id: dorm.id }, data: { totalCapacity: cap } });
      console.log(`  ↻ "${dorm.name}" already has ${bedCount} beds, capacity=${cap}`);
      continue;
    }

    console.log(`  Adding beds to "${dorm.name}"...`);

    if (dorm.structure === "CUBICLE_BASED") {
      // 4 cubicles, create beds per cubicle
      for (let ci = 1; ci <= 4; ci++) {
        const existingCubicle = await p.cubicle.findFirst({
          where: { dormId: dorm.id, name: `Cubicle ${ci}` },
        });
        const cubicle = existingCubicle ?? await p.cubicle.create({
          data: { dormId: dorm.id, schoolId: SCHOOL_ID, name: `Cubicle ${ci}`, capacity: 12 },
        });

        // Build bulk bed+position data
        const bedData = [];
        const posData = [];
        for (let bi = 1; bi <= 6; bi++) {
          const bedId = cuid();
          bedData.push({
            id: bedId, schoolId: SCHOOL_ID, dormId: dorm.id,
            cubicleId: cubicle.id, label: `Bed ${ci}.${bi}`, bedType: "DOUBLE_DECKER",
            updatedAt: new Date(),
          });
          posData.push(
            { id: cuid(), bedId, dormId: dorm.id, cubicleId: cubicle.id, schoolId: SCHOOL_ID, position: "UPPER", isOccupied: false, createdAt: new Date() },
            { id: cuid(), bedId, dormId: dorm.id, cubicleId: cubicle.id, schoolId: SCHOOL_ID, position: "LOWER", isOccupied: false, createdAt: new Date() }
          );
        }
        await p.bed.createMany({ data: bedData, skipDuplicates: true });
        await p.sleepingPosition.createMany({ data: posData, skipDuplicates: true });
      }
    } else {
      // OPEN_HALL: 20 singles
      const bedData = [];
      const posData = [];
      for (let bi = 1; bi <= 20; bi++) {
        const bedId = cuid();
        bedData.push({
          id: bedId, schoolId: SCHOOL_ID, dormId: dorm.id,
          label: `Bed ${bi}`, bedType: "SINGLE", updatedAt: new Date(),
        });
        posData.push({
          id: cuid(), bedId, dormId: dorm.id, schoolId: SCHOOL_ID,
          position: null, isOccupied: false, createdAt: new Date(),
        });
      }
      await p.bed.createMany({ data: bedData, skipDuplicates: true });
      await p.sleepingPosition.createMany({ data: posData, skipDuplicates: true });
    }

    const cap = await p.sleepingPosition.count({ where: { dormId: dorm.id } });
    await p.dormitory.update({ where: { id: dorm.id }, data: { totalCapacity: cap } });
    console.log(`  ✓ "${dorm.name}" → ${cap} sleeping positions`);
  }

  // ── Allocate students ──────────────────────────────────────────────
  const freshDorms = await p.dormitory.findMany({
    where: { schoolId: SCHOOL_ID },
    include: {
      permittedForms: true,
      _count: { select: { allocations: { where: { status: "CURRENT" } } } },
    },
  });

  // Pre-load all free positions per dorm
  const freePositions = {};
  for (const d of freshDorms) {
    const positions = await p.sleepingPosition.findMany({
      where: { dormId: d.id, isOccupied: false },
      select: { id: true, bedId: true, cubicleId: true },
    });
    freePositions[d.id] = positions;
  }

  // Track which students are already allocated
  const alreadyAllocated = new Set(
    (await p.allocationRecord.findMany({
      where: { schoolId: SCHOOL_ID, status: "CURRENT" },
      select: { studentId: true },
    })).map((r) => r.studentId)
  );

  const allocRecords = [];
  const posUpdates = [];

  for (const student of students) {
    if (alreadyAllocated.has(student.id)) continue;

    const eligible = freshDorms.find((d) => {
      if (d.status !== "ACTIVE") return false;
      if (d.totalCapacity > 0 && d._count.allocations >= d.totalCapacity) return false;
      if (d.allocationPolicy === "RESTRICTED_BY_FORM" && d.permittedForms.length > 0) {
        if (!d.permittedForms.some((pf) => pf.form === student.schoolClass.form)) return false;
      }
      return true;
    });

    if (!eligible) continue;

    const pos = freePositions[eligible.id]?.shift();

    allocRecords.push({
      id: cuid(),
      schoolId: SCHOOL_ID,
      studentId: student.id,
      dormId: eligible.id,
      sleepingPositionId: pos?.id ?? null,
      bedId: pos?.bedId ?? null,
      cubicleId: pos?.cubicleId ?? null,
      status: "CURRENT",
      notes: "Seeded allocation",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (pos) posUpdates.push(pos.id);
    eligible._count.allocations++;
  }

  if (allocRecords.length > 0) {
    await p.allocationRecord.createMany({ data: allocRecords, skipDuplicates: true });
    // Mark positions occupied in batches
    await p.sleepingPosition.updateMany({
      where: { id: { in: posUpdates } },
      data: { isOccupied: true },
    });
    console.log(`\n✅ Allocated ${allocRecords.length} students`);
  } else {
    console.log("\n↻ All students already allocated");
  }

  // ── Final summary ──────────────────────────────────────────────────
  const summary = await p.dormitory.findMany({
    where: { schoolId: SCHOOL_ID },
    include: { _count: { select: { allocations: { where: { status: "CURRENT" } } } } },
  });
  console.log("\n📊 Final occupancy:");
  for (const d of summary) {
    console.log(`   ${d.name.padEnd(16)}: ${d._count.allocations}/${d.totalCapacity} (${d.status})`);
  }
}

main()
  .then(() => { console.log("\nDone."); p.$disconnect(); })
  .catch((e) => { console.error("❌", e.message); p.$disconnect(); process.exit(1); });
