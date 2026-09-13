import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/auth";

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// Simple in-memory rate limiter: max 5 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();

  // Rate-limit check
  const existing = attempts.get(ip);
  if (existing) {
    if (now < existing.resetAt) {
      if (existing.count >= MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Too many login attempts. Try again in 15 minutes." },
          { status: 429 }
        );
      }
      existing.count++;
    } else {
      attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    }
  } else {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const student = await prisma.student.findUnique({ where: { email: email.toLowerCase() } });

  if (!student || !["ADMIN", "INSTITUTION_ADMIN"].includes(student.role)) {
    return NextResponse.json({ error: "Invalid admin credentials" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, student.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid admin credentials" }, { status: 401 });
  }

  // Clear rate limit on success
  attempts.delete(ip);

  const token = signSession({ studentId: student.id, role: student.role, email: student.email });
  const res = NextResponse.json({ ok: true, name: student.name, role: student.role });
  res.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8-hour admin sessions (shorter than student sessions)
  });
  return res;
}
