import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const VALID_FIELDS = ["logo", "stamp"] as const;
type UploadField = (typeof VALID_FIELDS)[number];

// ── Storage helpers ────────────────────────────────────────────────────────────

/**
 * On Vercel (or any environment with BLOB_READ_WRITE_TOKEN set) files are
 * stored in Vercel Blob — a durable, CDN-backed object store that survives
 * redeploys. The URL returned by `put()` is permanent and served globally.
 *
 * On localhost (no token) files are written to public/uploads/school/ exactly
 * as before so local development remains zero-config.
 */
async function storeFile(
  field: UploadField,
  schoolId: string,
  file: File,
  ext: string,
): Promise<string> {
  const filename = `${field}-${schoolId}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // ── Vercel Blob (production) ─────────────────────────────────────────────
    // Lazy-import so the package is tree-shaken on builds that don't use it.
    const { put } = await import("@vercel/blob");
    const blob = await put(`school/${filename}`, file, {
      access: "public",
      // Overwrite any previous upload for this field + school combination.
      addRandomSuffix: false,
    });
    return blob.url;
  }

  // ── Local filesystem (development) ──────────────────────────────────────────
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "school");
  await mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);
  return `/uploads/school/${filename}`;
}

// ── Route handler ──────────────────────────────────────────────────────────────

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
  if (!field || !(VALID_FIELDS as readonly string[]).includes(field)) {
    return NextResponse.json(
      { error: "Invalid field. Must be 'logo' or 'stamp'." },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PNG, JPG, WebP, or SVG image." },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 2 MB." },
      { status: 400 },
    );
  }

  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  const ext = extMap[file.type] ?? "png";

  let url: string;
  try {
    url = await storeFile(field as UploadField, user.schoolId, file, ext);
  } catch (err) {
    console.error("[upload] storage error:", err);
    return NextResponse.json(
      { error: "Failed to save the file. Please try again." },
      { status: 500 },
    );
  }

  // Persist the URL on the school record
  const updateData = field === "logo" ? { logoUrl: url } : { stampUrl: url };
  await prisma.school.update({
    where: { id: user.schoolId },
    data: updateData,
  });

  return NextResponse.json({ url });
}
