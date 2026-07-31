import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

const Schema = z.object({
  baseSalary: z.number().min(0).optional(), overtimeMultiplier: z.number().min(1).optional(),
  latePenaltyPerMin: z.number().min(0).optional(),
  officeStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workingHoursPerDay: z.number().min(1).max(24).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  const { userId } = await params;
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  try {
    const rules = await prisma.salaryRule.upsert({ where: { userId }, update: parsed.data, create: { userId, ...parsed.data } });
    return Response.json({ success: true, salaryRules: rules });
  } catch (err) {
    return Response.json({ error: 'Failed to update salary rules', details: String(err) }, { status: 500 });
  }
}
