import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdminSync } from '@/lib/auth';

const schema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  college: z.string().optional(),
  degreeProgram: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requireAdminSync();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Check email uniqueness if email is changed
    if (parsed.data.email) {
      const existing = await prisma.student.findUnique({ where: { email: parsed.data.email } });
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: 'Email is already in use by another account' }, { status: 409 });
      }
    }

    const updated = await prisma.student.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        college: true,
        degreeProgram: true,
      },
    });

    return NextResponse.json({ student: updated });
  } catch (err: any) {
    console.error('[admin/students PATCH]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
