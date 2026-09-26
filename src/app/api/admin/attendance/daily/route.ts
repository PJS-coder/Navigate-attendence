import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { getTodayISTDate } from '@/lib/dateUtils';

/**
 * GET /api/admin/attendance/daily?date=YYYY-MM-DD
 * Returns all employees and their exact attendance/clock-in/clock-out timings for the specified date.
 */
export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  const sp = req.nextUrl.searchParams;
  const dateParam = sp.get('date');

  let targetDate: Date;
  if (dateParam) {
    const [y, m, d] = dateParam.split('-').map(Number);
    targetDate = new Date(Date.UTC(y, m - 1, d));
  } else {
    targetDate = getTodayISTDate();
  }

  try {
    const employees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        hourlyRate: true,
        officeSsid: true,
      },
      orderBy: { name: 'asc' },
    });

    const attendances = await prisma.attendance.findMany({
      where: { date: targetDate },
    });

    const attendanceMap = new Map<string, typeof attendances[0]>();
    attendances.forEach(att => attendanceMap.set(att.userId, att));

    const roster = employees.map(emp => {
      const att = attendanceMap.get(emp.id) || null;
      return {
        user: emp,
        attendance: att,
      };
    });

    return Response.json({
      success: true,
      date: targetDate,
      roster,
    });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch daily attendance', details: String(err) }, { status: 500 });
  }
}
