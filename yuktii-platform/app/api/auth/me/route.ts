import { NextResponse } from 'next/server';
import { getStudentSessionSync } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = getStudentSessionSync();
  if (!session) {
    return NextResponse.json({ loggedIn: false });
  }
  try {
    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!student) {
      return NextResponse.json({ loggedIn: false });
    }
    return NextResponse.json({
      loggedIn: true,
      id: student.id,
      name: student.name,
      email: student.email,
      role: student.role,
    });
  } catch {
    return NextResponse.json({ loggedIn: false });
  }
}
