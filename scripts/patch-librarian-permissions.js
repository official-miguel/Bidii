const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const librarianRoles = await prisma.staffRole.findMany({
    where: { name: "Librarian" },
    select: { id: true, schoolId: true },
  });
  console.log("Found Librarian roles:", librarianRoles.length);

  for (const role of librarianRoles) {
    await prisma.rolePermission.upsert({
      where: { staffRoleId_module: { staffRoleId: role.id, module: "LIBRARY" } },
      create: { staffRoleId: role.id, module: "LIBRARY", canView: true, canManage: true },
      update: { canView: true, canManage: true },
    });
    console.log("  Patched LIBRARY permission for Librarian role", role.id, "(school:", role.schoolId + ")");
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
