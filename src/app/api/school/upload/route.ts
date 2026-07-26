import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const field = formData.get("field") as string | null; // "logo" or "stamp"

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!field || !["logo", "stamp"].includes(field)) {
    return NextResponse.json({ error: "Invalid field. Must be 'logo' or 'stamp'." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PNG, JPG, WebP, or SVG image." },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 2 MB." },
      { status: 400 }
    );
  }

  // Derive a safe extension
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  const ext = extMap[file.type] ?? "png";

  // Use schoolId to make the filename deterministic — re-uploading overwrites the previous file
  const filename = `${field}-${user.schoolId}.${ext}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "school");

  // Ensure directory exists (in case it was deleted)
  await mkdir(uploadsDir, { recursive: true });

  const filePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // The public URL served by Next.js
  const url = `/uploads/school/${filename}`;

  // Persist the URL on the school record immediately
  const updateData =
    field === "logo" ? { logoUrl: url } : { stampUrl: url };

  await prisma.school.update({
    where: { id: user.schoolId },
    data: updateData,
  });

  return NextResponse.json({ url });
}
