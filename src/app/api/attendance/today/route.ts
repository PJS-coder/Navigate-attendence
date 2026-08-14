import { NextRequest } from 'next/server';
import { startOfDay, getHours, getMinutes } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const now = new Date();
  const today = startOfDay(now);
  const currentHour = getHours(now);
  const currentMinute = getMinutes(now);
  const totalMinutes = currentHour * 60 + currentMinute;

  try {
    let attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.userId, date: today } },
    });

    // Rule 1: If Early Leave request is still PENDING past 6 PM (18:00), automatically mark ABSENT
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

    // Rule 2: If NO attendance record exists and time is past 2:15 PM (14:15) / 6:00 PM, automatically mark ABSENT in DB
    if (!attendance && totalMinutes >= (14 * 60 + 15)) {
      attendance = await prisma.attendance.upsert({
        where:  { userId_date: { userId: user.userId, date: today } },
        update: { status: 'ABSENT' },
        create: {
          userId: user.userId,
          date: today,
          status: 'ABSENT',
          isLate: false,
          lateMinutes: 0,
          wifiVerified: false,
        },
      });
    }

    return Response.json({ success: true, attendance: attendance || null });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch today record', details: String(err) }, { status: 500 });
  }
}
