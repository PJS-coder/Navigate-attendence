import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ attendanceId: string }> }) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  const { attendanceId } = await params;
  const body = await req.json();
  const { approval, statusOverride } = body;

  if (!['APPROVED', 'REJECTED'].includes(approval)) {
    return Response.json({ error: 'Invalid approval status. Must be APPROVED or REJECTED.' }, { status: 400 });
  }

  try {
    const existing = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!existing) {
      return Response.json({ error: 'Attendance record not found' }, { status: 404 });
    }

    let finalStatus = existing.status;
    if (approval === 'APPROVED') {
      if (statusOverride && ['PRESENT', 'HALF_DAY'].includes(statusOverride)) {
        finalStatus = statusOverride;
      } else if (existing.halfDayReason?.includes('Late Clock-Out')) {
        finalStatus = existing.isLate ? 'HALF_DAY' : 'PRESENT';
      } else {
        // Late clock-in or early leave approved as HALF_DAY
        finalStatus = 'HALF_DAY';
      }
    } else {
      // Rejected by manager -> Marked ABSENT
      finalStatus = 'ABSENT';
    }

    const record = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        halfDayApproval: approval,
        status: finalStatus,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return Response.json({ success: true, attendance: record });
  } catch (err) {
    return Response.json({ error: 'Failed to update approval', details: String(err) }, { status: 500 });
  }
}

