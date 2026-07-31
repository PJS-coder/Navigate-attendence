import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';

const Schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

  const { email, password } = parsed.data;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return Response.json({ error: 'Invalid email or password' }, { status: 401 });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return Response.json({ error: 'Invalid email or password' }, { status: 401 });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    return Response.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role, officeSsid: user.officeSsid, hourlyRate: user.hourlyRate } });
  } catch (err) {
    return Response.json({ error: 'Login failed', details: String(err) }, { status: 500 });
  }
}
