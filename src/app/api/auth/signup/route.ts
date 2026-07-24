import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession, SESSION_COOKIE } from "@/lib/auth";

/// Turns a school name into a URL-safe slug, e.g. "Green Hill Academy" ->
/// "green-hill-academy". Not shown to the user today, but reserved for a
/// future per-school login URL.
function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "school"
  );
}

async function uniqueSlug(base: string) {
  let slug = base;
  let n = 1;
  // Small, bounded loop — collisions are rare, this just guarantees we never
  // 500 on the (unlikely) case of two schools with an identical name.
  while (await prisma.school.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

const schema = z.object({
  schoolName: z.string().trim().min(2, "Enter your school's name."),
  schoolAddress: z.string().trim().optional().or(z.literal("")),
  schoolPhone: z.string().trim().optional().or(z.literal("")),
  fullName: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists. Try logging in instead." },
      { status: 409 }
    );
  }

  try {
    const slug = await uniqueSlug(slugify(data.schoolName));
    const passwordHash = await hashPassword(data.password);

    // Creates the school and the principal's own login together — if either
    // fails, neither is left behind.
    const { user } = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: data.schoolName,
          slug,
          address: data.schoolAddress || null,
          phone: data.schoolPhone || null,
          email: data.email,
        },
      });

      const user = await tx.user.create({
        data: {
          schoolId: school.id,
          email: data.email,
          passwordHash,
          role: "PRINCIPAL",
          // The principal set this password themselves at signup, so there's
          // no need to force a change on first login (unlike staff accounts
          // the principal creates later with a generated temp password).
          mustChangePassword: false,
        },
      });

      return { school, user };
    });

    const token = await createSession(user.id);
    const res = NextResponse.json({ role: user.role }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    const err = e as { code?: string; meta?: { target?: string[] | string } };
    if (err.code === "P2002") {
      const target: (string | undefined)[] = Array.isArray(err.meta?.target)
        ? err.meta.target
        : [err.meta?.target];
      if (target.includes("slug")) {
        return NextResponse.json(
          {
            error:
              "A school with a very similar name is already registered. Try a slightly different school name.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "An account with that email already exists. Try logging in instead." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't create your school account. Try again." },
      { status: 500 }
    );
  }
}
