import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  const { userId } = await params;
  const sp = req.nextUrl.searchParams;
  const year  = parseInt(sp.get('year')  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1), 10);
  try {
    const records = await prisma.attendance.findMany({
      where: { userId, date: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0) } },
      orderBy: { date: 'asc' },
    });
    return Response.json({ success: true, data: records });
  } catch {
    return Response.json({ error: 'Failed to fetch timesheet' }, { status: 500 });
  }
}
