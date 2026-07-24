import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, SESSION_COOKIE, buildOfflineToken } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    // Validate environment variables
    if (!process.env.DATABASE_URL) {
      console.error("[LOGIN] Missing DATABASE_URL environment variable");
      return NextResponse.json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    if (!process.env.SESSION_SECRET) {
      console.error("[LOGIN] Missing SESSION_SECRET environment variable");
      return NextResponse.json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    // Test database connectivity
    try {
      await prisma.$connect();
      if (process.env.NODE_ENV === "development") {
        console.log("[LOGIN] Database connection successful");
      }
    } catch (dbError) {
      console.error("[LOGIN] Database connection failed:", dbError);
      return NextResponse.json(
        { error: "Database connection failed. Please try again later." },
        { status: 503 }
      );
    }

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("[LOGIN] Failed to parse request body:", parseError);
      return NextResponse.json({ error: "Invalid request format." }, { status: 400 });
    }

    // Validate input schema
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.log("[LOGIN] Invalid input schema:", parsed.error.issues);
      return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // Log authentication attempt (without sensitive data)
    if (process.env.NODE_ENV === "development") {
      console.log(`[LOGIN] Authentication attempt for email: ${email}`);
    }

    // Find user in database
    let user;
    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (userQueryError) {
      console.error("[LOGIN] Error querying user:", userQueryError);
      return NextResponse.json(
        { error: "Authentication service temporarily unavailable." },
        { status: 503 }
      );
    }

    // Check if demo data exists if no user found
    if (!user) {
      try {
        const userCount = await prisma.user.count();
        if (userCount === 0) {
          console.error("[LOGIN] No users found in database - demo data may not be seeded");
          return NextResponse.json({
            error: "No user accounts found. Please run 'npm run db:seed-demo' to create demo accounts."
          }, { status: 404 });
        }
      } catch (countError) {
        console.error("[LOGIN] Error checking user count:", countError);
      }
    }

    // Same generic error whether the email doesn't exist or the password is
    // wrong, so login can't be used to enumerate registered accounts.
    const invalid = () => {
      if (process.env.NODE_ENV === "development") {
        console.log(`[LOGIN] Authentication failed for email: ${email}`);
      }
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    };

    if (!user || !user.isActive) return invalid();

    // Verify password
    let valid;
    try {
      valid = await verifyPassword(password, user.passwordHash);
    } catch (passwordError) {
      console.error("[LOGIN] Password verification error:", passwordError);
      return NextResponse.json(
        { error: "Authentication service temporarily unavailable." },
        { status: 503 }
      );
    }

    if (!valid) return invalid();

    // Create session
    let token;
    try {
      token = await createSession(user.id);
    } catch (sessionError) {
      console.error("[LOGIN] Session creation error:", sessionError);
      return NextResponse.json(
        { error: "Failed to create session. Please try again." },
        { status: 500 }
      );
    }

    // Build offline token
    let offlineToken;
    try {
      offlineToken = buildOfflineToken(user);
    } catch (tokenError) {
      console.error("[LOGIN] Offline token creation error:", tokenError);
      return NextResponse.json(
        { error: "Failed to create authentication token." },
        { status: 500 }
      );
    }

    // Log successful authentication
    if (process.env.NODE_ENV === "development") {
      console.log(`[LOGIN] Successfully authenticated user: ${email} (${user.role})`);
    }

    const res = NextResponse.json({
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      offlineToken,
    });

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;

  } catch (error) {
    // Catch-all error handler
    console.error("[LOGIN] Unexpected error:", error);
    
    // Don't expose internal error details in production
    const errorMessage = process.env.NODE_ENV === "development" 
      ? `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
      : "An unexpected error occurred. Please try again.";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  } finally {
    // Ensure database connection is properly handled
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error("[LOGIN] Error disconnecting from database:", disconnectError);
    }
  }
}
