import { NextRequest } from 'next/server';
import { calculateMonthlySalary } from '@/lib/salary';
import { getAuthUser, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ year: string; month: string }> }) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const { year: y, month: m } = await params;
  const year = parseInt(y, 10), month = parseInt(m, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return Response.json({ error: 'Invalid year or month' }, { status: 400 });
  }
  try {
    const breakdown = await calculateMonthlySalary(user.userId, year, month);
    return Response.json({ success: true, year, month, breakdown });
  } catch (err) {
    return Response.json({ error: 'Failed to calculate salary', details: String(err) }, { status: 500 });
  }
}
