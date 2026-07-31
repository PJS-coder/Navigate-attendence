import { NextRequest } from 'next/server';
import { startOfDay, getHours } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const now = new Date();
  const today = startOfDay(now);
  const currentHour = getHours(now);

  try {
    let attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.userId, date: today } },
    });

    // Auto-Absent rule: If request is still PENDING past 6 PM (18:00), automatically mark ABSENT
    if (attendance && attendance.halfDayApproval === 'PENDING' && currentHour >= 18) {
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          status: 'ABSENT',
          halfDayApproval: 'REJECTED',
          halfDayReason: 'Request expired after 6:00 PM without Admin approval',
        },
      });
    }

    return Response.json({ success: true, attendance: attendance || null });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch today record', details: String(err) }, { status: 500 });
  }
}
