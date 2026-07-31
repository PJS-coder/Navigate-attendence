import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

function adminGuard(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return { err: unauthorized() };
  if (user.role !== 'ADMIN') return { err: forbidden('Admin access required') };
  return { user };
}

const UpdateSchema = z.object({
  email: z.string().email().optional(), name: z.string().optional(),
  role: z.enum(['EMPLOYEE', 'ADMIN']).optional(),
  officeSsid: z.string().optional(), hourlyRate: z.number().min(0).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { err } = adminGuard(req);
  if (err) return err;
  const { userId } = await params;
  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  try {
    const user = await prisma.user.update({ where: { id: userId }, data: parsed.data, select: { id: true, email: true, name: true, role: true, officeSsid: true, hourlyRate: true, createdAt: true } });
    return Response.json({ success: true, user });
  } catch (err) {
    return Response.json({ error: 'Failed to update employee', details: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { err } = adminGuard(req);
  if (err) return err;
  const { userId } = await params;
  try {
    await prisma.user.delete({ where: { id: userId } });
    return Response.json({ success: true, message: 'Employee deleted successfully' });
  } catch (err) {
    return Response.json({ error: 'Failed to delete employee', details: String(err) }, { status: 500 });
  }
}
