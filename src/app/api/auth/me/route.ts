import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, name: true, role: true, officeSsid: true, hourlyRate: true, createdAt: true, salaryRules: true },
    });
    if (!dbUser) return Response.json({ error: 'User not found' }, { status: 404 });
    return Response.json({ success: true, user: dbUser });
  } catch {
    return Response.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
