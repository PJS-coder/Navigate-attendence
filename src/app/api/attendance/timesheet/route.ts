import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { getMonthBounds } from '@/lib/dateUtils';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const year  = parseInt(sp.get('year')  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1), 10);
  const page  = Math.max(1, parseInt(sp.get('page')  ?? '1', 10));
  const limit = Math.min(100, parseInt(sp.get('limit') ?? '31', 10));

  const { start, end } = getMonthBounds(year, month);

  try {
    const [records, total] = await Promise.all([
      prisma.attendance.findMany({ where: { userId: user.userId, date: { gte: start, lte: end } }, orderBy: { date: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.attendance.count({ where: { userId: user.userId, date: { gte: start, lte: end } } }),
    ]);
    return Response.json({ success: true, data: records, meta: { total, page, limit, year, month } });
  } catch {
    return Response.json({ error: 'Failed to fetch timesheet' }, { status: 500 });
  }
}
