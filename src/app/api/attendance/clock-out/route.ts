import { NextRequest } from 'next/server';
import { z } from 'zod';
import { differenceInMinutes, parseISO } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { getTodayISTDate, getISTTimeParts } from '@/lib/dateUtils';

const Schema = z.object({
  timestamp: z.string().datetime(),
  salesRevenue: z.number().min(0),
  leadsAssigned: z.number().min(0).optional().default(0),
  isEarlyLeave: z.boolean().optional().default(false),
  reason: z.string().optional(),
});

// Time thresholds (IST)
const CLOCK_OUT_OPEN  = { h: 18, m: 45 }; // 06:45 PM
const CLOCK_OUT_CLOSE = { h: 19, m: 15 }; // 07:15 PM

function toMinutes(h: number, m: number) { return h * 60 + m; }

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

  const userId = authUser.userId;
  const { timestamp, salesRevenue, leadsAssigned, isEarlyLeave, reason } = parsed.data;
  const now = parseISO(timestamp);
  const today = getTodayISTDate(now);

  try {
    const record = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
    if (!record?.clockIn) return Response.json({ error: 'You have not clocked in today' }, { status: 400 });
    if (record.clockOut) return Response.json({ error: 'Already clocked out for today' }, { status: 400 });

    const totalMinutes = differenceInMinutes(now, record.clockIn);
    const totalHours = parseFloat((totalMinutes / 60).toFixed(2));
    const { totalMinutes: nowMin, hour, minute } = getISTTimeParts(now);
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const openMin  = toMinutes(CLOCK_OUT_OPEN.h, CLOCK_OUT_OPEN.m);   // 18:45 (1125 mins)
    const closeMin = toMinutes(CLOCK_OUT_CLOSE.h, CLOCK_OUT_CLOSE.m); // 19:15 (1155 mins)

    const isBeforeOpen = nowMin < openMin;
    const isAfterClose = nowMin > closeMin;

    // Block direct clock-out before 6:45 PM unless requested via early-leave
    if (isBeforeOpen && !isEarlyLeave) {
      return Response.json(
        { error: 'Clock-out opens at 06:45 PM. Use "Request Early Leave" to submit an early departure request before then.' },
        { status: 400 }
      );
    }

    let halfDayApproval: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' = record.halfDayApproval;
    let halfDayReason: string | null = record.halfDayReason;
    let status = record.status;
    let message = `Clocked out successfully — Sales ₹${salesRevenue} logged.`;

    if (isBeforeOpen) {
      // Early leave before 6:45 PM
      halfDayApproval = 'PENDING';
      halfDayReason = reason
        ? `Early Leave (Before 6:45 PM at ${timeString}): ${reason}`
        : `Early Leave request before 06:45 PM (at ${timeString})`;
      message = 'Early leave request submitted to Manager! Pending approval.';
    } else if (isAfterClose) {
      // Late clock-out after 7:15 PM
      halfDayApproval = 'PENDING';
      halfDayReason = reason
        ? `Late Clock-Out (After 7:15 PM at ${timeString}): ${reason}`
        : `Late Clock-Out request after 07:15 PM (at ${timeString})`;
      message = 'Late clock-out request submitted to Manager for approval (after 7:15 PM).';
    } else {
      // Normal on-time clock-out window (6:45 PM – 7:15 PM)
      // Retain approval status if already pending from morning late clock-in
      if (record.halfDayApproval !== 'PENDING') {
        halfDayApproval = 'NONE';
      }
      message = `Clocked out on time (${timeString}) — Sales ₹${salesRevenue} logged.`;
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
        halfDayReason,
      },
    });

    return Response.json({
      success: true,
      attendance: updated,
      isEarlyDeparture: isBeforeOpen,
      isLateClockOut: isAfterClose,
      pendingApproval: halfDayApproval === 'PENDING',
      message,
    });
  } catch (err) {
    return Response.json({ error: 'Clock-out failed', details: String(err) }, { status: 500 });
  }
}
