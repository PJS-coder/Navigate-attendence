import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

function adminGuard(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return { err: unauthorized() };
  if (user.role !== 'ADMIN') return { err: forbidden('Admin access required') };
  return { user };
}

const CreateSchema = z.object({
  email: z.string().email(), password: z.string().min(6), name: z.string().min(2),
  role: z.enum(['EMPLOYEE', 'ADMIN']).default('EMPLOYEE'),
  officeSsid: z.string().default(''), hourlyRate: z.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const { err } = adminGuard(req);
  if (err) return err;
  try {
    const employees = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, officeSsid: true, hourlyRate: true, createdAt: true, salaryRules: true, _count: { select: { attendances: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Response.json({ success: true, data: employees, total: employees.length });
  } catch {
    return Response.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { err } = adminGuard(req);
  if (err) return err;
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

  const { email, password, name, role, officeSsid, hourlyRate } = parsed.data;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return Response.json({ error: 'An account with this email already exists' }, { status: 409 });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role, officeSsid, hourlyRate, salaryRules: { create: { baseSalary: hourlyRate * 160, overtimeMultiplier: 1.5, latePenaltyPerMin: 1.0, officeStartTime: '09:00', workingHoursPerDay: 8.0 } } },
      select: { id: true, email: true, name: true, role: true, officeSsid: true, hourlyRate: true, createdAt: true },
    });
    return Response.json({ success: true, user }, { status: 201 });
  } catch (err) {
    return Response.json({ error: 'Failed to create employee', details: String(err) }, { status: 500 });
  }
}
