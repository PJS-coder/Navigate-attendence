import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  differenceInMinutes, parseISO, set,
  startOfDay, startOfMonth, endOfMonth,
  getHours, getMinutes,
} from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/auth';

/**
 * POST /api/attendance/clock-in
 *
 * Time windows (IST):
 *   Before 09:55        → Shift not open yet
 *   09:55 – 10:14       → PRESENT (on-time / late-but-relaxation)
 *   10:15 – 14:14       → HALF_DAY automatically
 *   14:15 and after     → Too late — return 423 (Absent locked)
 */

// ── Config ────────────────────────────────────────────────────────────────────
const OFFICE_LAT    = parseFloat(process.env.OFFICE_LAT            ?? '28.6345');
const OFFICE_LNG    = parseFloat(process.env.OFFICE_LNG            ?? '77.285549');
const OFFICE_RADIUS = parseInt(process.env.OFFICE_RADIUS_METERS    ?? '150', 10);

// Time thresholds (hours + minutes)
const SHIFT_OPEN      = { h: 9,  m: 55 };  // 09:55 — earliest allowed clock-in
const HALF_DAY_AFTER  = { h: 10, m: 15 };  // 10:15 — auto half-day
const ABSENT_AFTER    = { h: 14, m: 15 };  // 14:15 — no clock-in, marked absent

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
  method: z.enum(['gps', 'pending']),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { timestamp, method, lat, lng } = parsed.data;
  const now   = parseISO(timestamp);
  const today = startOfDay(now);

  const hour   = getHours(now);
  const minute = getMinutes(now);
  const nowMin = toMinutes(hour, minute);

  // ── 1. Shift window gate ───────────────────────────────────────────────────
  if (nowMin < toMinutes(SHIFT_OPEN.h, SHIFT_OPEN.m)) {
    return Response.json(
      { error: `Shift opens at ${SHIFT_OPEN.h}:${String(SHIFT_OPEN.m).padStart(2,'0')} AM. You cannot clock in yet.` },
      { status: 400 }
    );
  }

  // ── 2. Absent cutoff gate ─────────────────────────────────────────────────
  if (nowMin >= toMinutes(ABSENT_AFTER.h, ABSENT_AFTER.m)) {
    // Create / update an ABSENT record so it appears on the timesheet
    try {
      const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
      if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

      await prisma.attendance.upsert({
        where:  { userId_date: { userId: authUser.userId, date: today } },
        update: { status: 'ABSENT' },
        create: { userId: authUser.userId, date: today, status: 'ABSENT', isLate: false, lateMinutes: 0 },
      });
    } catch { /* non-critical — ignore */ }

    return Response.json(
      { error: `Clock-in window closed at ${ABSENT_AFTER.h}:${String(ABSENT_AFTER.m).padStart(2,'0')} PM. You have been marked Absent for today.`, absent: true },
      { status: 423 }  // 423 Locked — custom signal for the UI
    );
  }

  // ── 3. Server-side GPS verification ───────────────────────────────────────
  let verificationMethod: string = 'pending';
  let wifiVerified = false;

  if (method === 'gps' && lat !== undefined && lng !== undefined) {
    const distance = haversineDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
    if (distance <= OFFICE_RADIUS) {
      verificationMethod = 'gps';
      wifiVerified = true;
    }
  }

  // ── 4. Business logic ─────────────────────────────────────────────────────
  try {
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: authUser.userId, date: today } },
    });
    if (existing?.clockIn) {
      return Response.json({ error: 'Already clocked in today' }, { status: 400 });
    }

    const isHalfDay    = nowMin >= toMinutes(HALF_DAY_AFTER.h, HALF_DAY_AFTER.m);
    const shiftStart   = set(today, { hours: SHIFT_OPEN.h, minutes: SHIFT_OPEN.m, seconds: 0 });
    const lateMinutes  = now > shiftStart ? differenceInMinutes(now, shiftStart) : 0;

    const monthRecords = await prisma.attendance.findMany({
      where: { userId: authUser.userId, date: { gte: startOfMonth(today), lte: endOfMonth(today) } },
    });
    const totalPrevLate  = monthRecords.reduce((a, r) => a + (r.lateMinutes || 0), 0);
    const relaxationDone = (totalPrevLate + lateMinutes) > 240;

    let status: 'PRESENT' | 'HALF_DAY' = 'PRESENT';
    let message = verificationMethod === 'pending'
      ? 'Clocked in — awaiting manager location approval ⏳'
      : 'Clocked in on time ✓';

    if (isHalfDay) {
      status  = 'HALF_DAY';
      message = `Clocked in after ${HALF_DAY_AFTER.h}:${String(HALF_DAY_AFTER.m).padStart(2,'0')} AM — marked Half Day`;
    } else if (relaxationDone && lateMinutes > 0) {
      status  = 'HALF_DAY';
      message = `Late (${lateMinutes}m) — relaxation exhausted, Half Day`;
    } else if (lateMinutes > 0) {
      const remainMins = Math.max(0, 240 - (totalPrevLate + lateMinutes));
      message = `Late by ${lateMinutes}m — ${(remainMins / 60).toFixed(1)} hrs relaxation left`;
      if (verificationMethod === 'pending') message += ' · awaiting location approval ⏳';
    }

    const attendance = await prisma.attendance.upsert({
      where:  { userId_date: { userId: authUser.userId, date: today } },
      update: { clockIn: now, status, isLate: lateMinutes > 0, lateMinutes, wifiVerified, verificationMethod },
      create: { userId: authUser.userId, date: today, clockIn: now, status, isLate: lateMinutes > 0, lateMinutes, wifiVerified, verificationMethod },
    });

    return Response.json({ success: true, attendance, message, verificationMethod });
  } catch (err) {
    return Response.json({ error: 'Clock-in failed', details: String(err) }, { status: 500 });
  }
}
