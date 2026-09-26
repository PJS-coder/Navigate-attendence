import { NextRequest } from 'next/server';
import { z } from 'zod';
import { differenceInMinutes, parseISO, set } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { getTodayISTDate, getISTTimeParts } from '@/lib/dateUtils';

/**
 * POST /api/attendance/clock-in
 *
 * Time windows (IST):
 *   Before 09:55        → Shift not open yet (Error 400)
 *   09:55 – 10:30       → PRESENT (On-time clock-in)
 *   10:30 – 11:00       → HALF_DAY (Automatically marked Half Day)
 *   11:00 and after     → Clock-in closed; Approval request sent to Manager (PENDING)
 *                         If manager accepts → marked HALF_DAY / PRESENT
 *                         If manager rejects → marked ABSENT
 */

// ── Config ────────────────────────────────────────────────────────────────────
const OFFICE_LAT    = parseFloat(process.env.OFFICE_LAT            ?? '28.7092935');
const OFFICE_LNG    = parseFloat(process.env.OFFICE_LNG            ?? '77.1234043');
const OFFICE_RADIUS = parseInt(process.env.OFFICE_RADIUS_METERS    ?? '200', 10);

// Time thresholds (hours + minutes)
const SHIFT_OPEN      = { h: 9,  m: 55 }; // 09:55 — earliest allowed clock-in
const PRESENT_UNTIL   = { h: 10, m: 30 }; // 10:30 — on-time clock-in closes
const HALF_DAY_UNTIL  = { h: 11, m: 0  }; // 11:00 — half-day closes, manager approval required after

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Returns total minutes past midnight for quick threshold comparisons */
function toMinutes(h: number, m: number) { return h * 60 + m; }

// ── Schema ────────────────────────────────────────────────────────────────────
const Schema = z.object({
  timestamp: z.string().datetime(),
  method: z.enum(['gps']),
  lat: z.number({ required_error: 'GPS latitude is required' }),
  lng: z.number({ required_error: 'GPS longitude is required' }),
  reason: z.string().optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Location verification failed. Valid GPS coordinates are required to clock in.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { timestamp, lat, lng, reason } = parsed.data;
  const now   = parseISO(timestamp);
  const today = getTodayISTDate(now);

  const { totalMinutes: nowMin, hour, minute } = getISTTimeParts(now);

  // ── 1. Shift window gate: Before 09:55 AM ──────────────────────────────────
  if (nowMin < toMinutes(SHIFT_OPEN.h, SHIFT_OPEN.m)) {
    return Response.json(
      { error: `Shift opens at 09:55 AM. You cannot clock in yet.` },
      { status: 400 }
    );
  }

  // ── 2. Server-side GPS radius verification ─────────────────────────────────
  const distance = haversineDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
  const allowedRadius = Math.max(OFFICE_RADIUS, 180);
  if (distance > allowedRadius) {
    return Response.json(
      { error: `Clock-in failed: You are ${Math.round(distance)}m away from the office. You must be within ${allowedRadius}m to clock in.` },
      { status: 400 }
    );
  }

  const verificationMethod = 'gps';
  const wifiVerified = true;

  // ── 3. Business logic based on time windows ────────────────────────────────
  try {
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: authUser.userId, date: today } },
    });
    if (existing?.clockIn) {
      return Response.json({ error: 'Already clocked in today' }, { status: 400 });
    }

    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    let status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' = 'PRESENT';
    let halfDayApproval: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'NONE';
    let halfDayReason: string | null = null;
    let isLate = false;
    let lateMinutes = 0;
    let message = 'Clocked in successfully (On Time ✓)';

    if (nowMin < toMinutes(PRESENT_UNTIL.h, PRESENT_UNTIL.m)) {
      // 09:55 AM – 10:30 AM: On-Time clock in -> PRESENT
      status = 'PRESENT';
      halfDayApproval = 'NONE';
      isLate = false;
      lateMinutes = 0;
      message = 'Clocked in on time ✓';
    } else if (nowMin < toMinutes(HALF_DAY_UNTIL.h, HALF_DAY_UNTIL.m)) {
      // 10:30 AM – 11:00 AM: Automatic HALF_DAY
      status = 'HALF_DAY';
      halfDayApproval = 'NONE';
      isLate = true;
      lateMinutes = nowMin - toMinutes(PRESENT_UNTIL.h, PRESENT_UNTIL.m);
      message = `Clocked in at ${timeString} (after 10:30 AM) — automatically marked Half Day.`;
    } else {
      // After 11:00 AM: Requires Manager Approval
      status = 'ABSENT'; // Default until manager approves
      halfDayApproval = 'PENDING';
      halfDayReason = reason
        ? `Late Clock-In (After 11:00 AM at ${timeString}): ${reason}`
        : `Late Clock-In request after 11:00 AM (at ${timeString})`;
      isLate = true;
      lateMinutes = nowMin - toMinutes(PRESENT_UNTIL.h, PRESENT_UNTIL.m);
      message = `Clock-in window closed at 11:00 AM. Approval request sent to Manager!`;
    }

    const attendance = await prisma.attendance.upsert({
      where:  { userId_date: { userId: authUser.userId, date: today } },
      update: {
        clockIn: now,
        status,
        halfDayApproval,
        halfDayReason,
        isLate,
        lateMinutes,
        wifiVerified,
        verificationMethod,
      },
      create: {
        userId: authUser.userId,
        date: today,
        clockIn: now,
        status,
        halfDayApproval,
        halfDayReason,
        isLate,
        lateMinutes,
        wifiVerified,
        verificationMethod,
      },
    });

    return Response.json({
      success: true,
      attendance,
      message,
      verificationMethod,
      pendingApproval: halfDayApproval === 'PENDING',
    });
  } catch (err) {
    return Response.json({ error: 'Clock-in failed', details: String(err) }, { status: 500 });
  }
}
