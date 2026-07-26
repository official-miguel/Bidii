import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename = 'User' 
  ORDER BY indexname
`;

console.log("=== User table indexes ===");
for (const r of rows) {
  console.log(r.indexname, "=>", r.indexdef);
}

await prisma.$disconnect();
