import { NextRequest } from 'next/server';
import { z } from 'zod';
import { differenceInMinutes, parseISO, startOfDay, getHours, getMinutes } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';

const Schema = z.object({
  timestamp: z.string().datetime(),
  salesRevenue: z.number().min(0),
  leadsAssigned: z.number().min(0).optional().default(0),
  isEarlyLeave: z.boolean().optional().default(false),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

  const userId = authUser.userId;
  const { timestamp, salesRevenue, leadsAssigned, isEarlyLeave, reason } = parsed.data;
  const now = parseISO(timestamp);
  const today = startOfDay(now);

  try {
    const record = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
    if (!record?.clockIn) return Response.json({ error: 'You have not clocked in today' }, { status: 400 });
    if (record.clockOut) return Response.json({ error: 'Already clocked out for today' }, { status: 400 });

    const totalMinutes = differenceInMinutes(now, record.clockIn);
    const totalHours = parseFloat((totalMinutes / 60).toFixed(2));
    const hour = getHours(now), minute = getMinutes(now);

    // Clock-out opens at exactly 18:00 (6:00 PM)
    const beforeClockOutWindow = hour < 18;
    const isEarlyDeparture = beforeClockOutWindow || isEarlyLeave;

    // Block clock-out entirely before 6:00 PM unless it's a flagged early-leave
    if (beforeClockOutWindow && !isEarlyLeave) {
      return Response.json(
        { error: 'Clock-out opens at 6:00 PM. Use "Request Early Leave" to submit a Half Day request before then.' },
        { status: 400 }
      );
    }

    let halfDayApproval: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'NONE';
    let status = record.status;
    let message = `Clocked out successfully — Sales ₹${salesRevenue} logged.`;

    if (isEarlyDeparture) {
      halfDayApproval = 'PENDING';
      message = 'Early leave request submitted to Admin! Pending approval.';
    }

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        clockOut: now,
        totalHours,
        status,
        salesRevenue,
        leadsAssigned: leadsAssigned ?? 0,
        halfDayApproval,
        halfDayReason: isEarlyDeparture ? (reason || 'Requested early leave before 6:00 PM') : null,
      },
    });

    return Response.json({
      success: true,
      attendance: updated,
      isEarlyDeparture,
      message,
    });
  } catch (err) {
    return Response.json({ error: 'Clock-out failed', details: String(err) }, { status: 500 });
  }
}
