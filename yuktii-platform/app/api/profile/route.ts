import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStudentSessionSync } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const profileSchema = z.object({
  phone: z.string().trim().min(7).max(30),
  college: z.string().trim().max(160).nullable().optional(),
  degreeProgram: z.string().trim().min(1).max(80),
  degreeProgramOther: z.string().trim().max(160).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const session = getStudentSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid profile.' }, { status: 400 });

  const values = parsed.data;
  const student = await prisma.student.update({
    where: { id: session.studentId },
    data: {
      phone: values.phone,
      college: values.college || null,
      degreeProgram: values.degreeProgram,
      degreeProgramOther: values.degreeProgram === 'Other' ? (values.degreeProgramOther || null) : null,
    },
    select: { phone: true, college: true, degreeProgram: true, degreeProgramOther: true },
  });
  return NextResponse.json({ student });
}
