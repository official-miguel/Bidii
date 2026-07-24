/**
 * Fix Eagles House (missing positions) and Jasmine House (missing beds/positions)
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const SCHOOL_ID = "cmrj17f4m0007vbnognq81682";

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
}

async function fixDorm(dormId, dormName) {
  // Clear all sleeping positions and beds, then rebuild cleanly
  const existingPos = await p.sleepingPosition.count({ where: { dormId } });
  console.log(`\n${dormName}: ${existingPos} existing positions`);

  if (existingPos === 0) {
    // Rebuild beds and positions for this dorm
    const cubicles = await p.cubicle.findMany({ where: { dormId } });

    if (cubicles.length === 0) {
      // OPEN_HALL or cubicle-based with no cubicles — create them
      console.log(`  Creating 4 cubicles...`);
      for (let ci = 1; ci <= 4; ci++) {
        const cubicle = await p.cubicle.upsert({
          where: { dormId_name: { dormId, name: `Cubicle ${ci}` } },
          create: { dormId, schoolId: SCHOOL_ID, name: `Cubicle ${ci}`, capacity: 12 },
          update: {},
        });
        const bedData = [];
        const posData = [];
        for (let bi = 1; bi <= 6; bi++) {
          const bedId = cuid();
          bedData.push({ id: bedId, schoolId: SCHOOL_ID, dormId, cubicleId: cubicle.id, label: `Bed ${ci}.${bi}`, bedType: "DOUBLE_DECKER", updatedAt: new Date() });
          posData.push(
            { id: cuid(), bedId, dormId, cubicleId: cubicle.id, schoolId: SCHOOL_ID, position: "UPPER", isOccupied: false, createdAt: new Date() },
            { id: cuid(), bedId, dormId, cubicleId: cubicle.id, schoolId: SCHOOL_ID, position: "LOWER", isOccupied: false, createdAt: new Date() }
          );
        }
        await p.bed.createMany({ data: bedData, skipDuplicates: true });
        await p.sleepingPosition.createMany({ data: posData, skipDuplicates: true });
      }
    } else {
      // Has cubicles but no positions — rebuild positions from existing beds
      const beds = await p.bed.findMany({ where: { dormId } });
      const posData = [];
      for (const bed of beds) {
        posData.push(
          { id: cuid(), bedId: bed.id, dormId, cubicleId: bed.cubicleId, schoolId: SCHOOL_ID, position: "UPPER", isOccupied: false, createdAt: new Date() },
          { id: cuid(), bedId: bed.id, dormId, cubicleId: bed.cubicleId, schoolId: SCHOOL_ID, position: "LOWER", isOccupied: false, createdAt: new Date() }
        );
      }
      if (posData.length) {
        await p.sleepingPosition.createMany({ data: posData, skipDuplicates: true });
        console.log(`  Rebuilt ${posData.length} positions from ${beds.length} beds`);
      }
    }
  }

  const finalCap = await p.sleepingPosition.count({ where: { dormId } });
  await p.dormitory.update({ where: { id: dormId }, data: { totalCapacity: finalCap } });
  console.log(`  ✓ ${dormName} capacity = ${finalCap}`);
  return finalCap;
}

async function main() {
  const dorms = await p.dormitory.findMany({
    where: { schoolId: SCHOOL_ID },
    include: { _count: { select: { sleepingPositions: true } } },
  });

  for (const d of dorms) {
    if (d._count.sleepingPositions === 0 || d.totalCapacity !== d._count.sleepingPositions) {
      await fixDorm(d.id, d.name);
    }
  }

  // Now allocate remaining unallocated students
  const freshDorms = await p.dormitory.findMany({
    where: { schoolId: SCHOOL_ID },
    include: {
      permittedForms: true,
      _count: { select: { allocations: { where: { status: "CURRENT" } } } },
    },
  });

  const unallocated = await p.student.findMany({
    where: {
      schoolId: SCHOOL_ID,
      accommodationAllocations: { none: { status: "CURRENT" } },
    },
    select: { id: true, schoolClass: { select: { form: true } } },
  });
  console.log(`\n${unallocated.length} students without current allocation`);

  const freePositions = {};
  for (const d of freshDorms) {
    freePositions[d.id] = await p.sleepingPosition.findMany({
      where: { dormId: d.id, isOccupied: false },
      select: { id: true, bedId: true, cubicleId: true },
    });
  }

  const allocRecords = [];
  const posUpdates = [];

  for (const student of unallocated) {
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
      id: cuid(), schoolId: SCHOOL_ID, studentId: student.id, dormId: eligible.id,
      sleepingPositionId: pos?.id ?? null, bedId: pos?.bedId ?? null,
      cubicleId: pos?.cubicleId ?? null, status: "CURRENT",
      notes: "Seeded allocation", createdAt: new Date(), updatedAt: new Date(),
    });
    if (pos) posUpdates.push(pos.id);
    eligible._count.allocations++;
  }

  if (allocRecords.length) {
    await p.allocationRecord.createMany({ data: allocRecords, skipDuplicates: true });
    await p.sleepingPosition.updateMany({ where: { id: { in: posUpdates } }, data: { isOccupied: true } });
    console.log(`✅ Allocated ${allocRecords.length} additional students`);
  }

  // Final summary
  const summary = await p.dormitory.findMany({
    where: { schoolId: SCHOOL_ID },
    include: { _count: { select: { allocations: { where: { status: "CURRENT" } } } } },
  });
  console.log("\n📊 Final occupancy:");
  for (const d of summary) {
    console.log(`   ${d.name.padEnd(18)}: ${d._count.allocations}/${d.totalCapacity} occupied`);
  }
}

main()
  .then(() => { console.log("\nDone."); p.$disconnect(); })
  .catch((e) => { console.error("❌", e.message); p.$disconnect(); process.exit(1); });
