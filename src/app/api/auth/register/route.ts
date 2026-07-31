import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  officeSsid: z.string().min(1),
  hourlyRate: z.number().min(0).optional().default(0),
  role: z.enum(['EMPLOYEE', 'ADMIN']).optional().default('EMPLOYEE'),
});

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

  const { email, password, name, officeSsid, hourlyRate, role } = parsed.data;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return Response.json({ error: 'Email already registered' }, { status: 409 });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email, password: hashedPassword, name, officeSsid, hourlyRate, role,
        salaryRules: { create: { baseSalary: 0, overtimeMultiplier: 1.5, latePenaltyPerMin: 0, officeStartTime: '09:00', workingHoursPerDay: 8 } },
      },
      select: { id: true, email: true, name: true, role: true, officeSsid: true, hourlyRate: true, createdAt: true },
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    return Response.json({ success: true, token, user }, { status: 201 });
  } catch (err) {
    return Response.json({ error: 'Registration failed', details: String(err) }, { status: 500 });
  }
}
