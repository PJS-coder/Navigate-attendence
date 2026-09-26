import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { getTodayISTDate } from '@/lib/dateUtils';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const now = new Date();
  const today = getTodayISTDate(now);

  try {
    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.userId, date: today } },
    });

    return Response.json({ success: true, attendance: attendance || null });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch today record', details: String(err) }, { status: 500 });
  }
}

