import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

/// Optional local-dev helper only. In normal use, a school is created
/// through the signup flow at /signup (principal enters their own school
/// name + details and picks their own password) — this script just seeds a
/// demo school so you have something to click around in without going
/// through that form first.
async function main() {
  const email = process.env.SEED_PRINCIPAL_EMAIL || "principal@bidii.school";
  const password = process.env.SEED_PRINCIPAL_PASSWORD || "ChangeMe123!";
  const schoolName = process.env.SEED_SCHOOL_NAME || "Bidii Demo School";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Principal account already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const slugBase = schoolName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: { name: schoolName, slug: slugBase || "bidii-demo-school", email },
    });

    await tx.user.create({
      data: {
        schoolId: school.id,
        email,
        passwordHash,
        role: "PRINCIPAL",
        mustChangePassword: true,
      },
    });
  });

  console.log("Seeded demo school + principal account:");
  console.log(`  school:   ${schoolName}`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("Log in and change this password immediately.");
  console.log("\nTip: real schools sign up for their own account at /signup instead.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
