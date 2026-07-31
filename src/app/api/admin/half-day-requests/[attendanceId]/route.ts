import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ attendanceId: string }> }) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  const { attendanceId } = await params;
  const { approval } = await req.json();

  if (!['APPROVED', 'REJECTED'].includes(approval)) {
    return Response.json({ error: 'Invalid approval status. Must be APPROVED or REJECTED.' }, { status: 400 });
  }

  try {
    const record = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        halfDayApproval: approval,
        // Approved -> HALF_DAY, Rejected -> ABSENT
        status: approval === 'APPROVED' ? 'HALF_DAY' : 'ABSENT',
      },
    });

    return Response.json({ success: true, attendance: record });
  } catch (err) {
    return Response.json({ error: 'Failed to update approval', details: String(err) }, { status: 500 });
  }
}
