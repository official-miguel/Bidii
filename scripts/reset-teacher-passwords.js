const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const p = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("Teacher@2026", 12);
  const result = await p.user.updateMany({
    where: { email: { endsWith: "@trillionaire.school" } },
    data: { passwordHash: hash },
  });
  console.log("Updated", result.count, "teacher accounts to password: Teacher@2026");
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
