import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  try {
    const requests = await prisma.attendance.findMany({
      where: { halfDayApproval: { in: ['PENDING', 'APPROVED', 'REJECTED'] } },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Response.json({ success: true, data: requests });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch half-day requests', details: String(err) }, { status: 500 });
  }
}
