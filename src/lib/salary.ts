import { prisma } from './prisma';
import { startOfMonth, endOfMonth } from 'date-fns';

export interface SalaryBreakdown {
  fullDays: number; halfDays: number; onLeaveDays: number;
  fullDayPay: number; halfDayPay: number; onLeaveDeduction: number;
  dailyRate: number; relaxationHoursUsed: number; relaxationHoursRemaining: number;
  regularHours: number; overtimeHours: number; regularPay: number;
  overtimePay: number; lateDeductions: number; grossSalary: number;
  totalDaysPresent: number; totalDaysLate: number;
}

const round = (n: number) => parseFloat(n.toFixed(2));

export async function calculateMonthlySalary(userId: string, year: number, month: number): Promise<SalaryBreakdown> {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { salaryRules: true } });
  if (!user) throw new Error('User not found');

  const records = await prisma.attendance.findMany({
    where: { userId, date: { gte: start, lte: end }, clockOut: { not: null } },
  });

  const monthlyBaseSalary = user.hourlyRate > 0 ? user.hourlyRate : 9000;
  const totalDaysInMonth = end.getDate();
  let workingDaysInMonth = 0;
  for (let d = 1; d <= totalDaysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) workingDaysInMonth++;
  }

  const dailyRate = monthlyBaseSalary / workingDaysInMonth;
  const halfDayRate = dailyRate * 0.5;
  const regularLimit = user.salaryRules?.workingHoursPerDay ?? 8;

  let fullDays = 0, halfDays = 0, regularHours = 0, overtimeHours = 0;
  let totalLateMinutes = 0, totalDaysPresent = 0, totalDaysLate = 0;

  for (const r of records) {
    const hours = r.totalHours ?? 0;
    totalDaysPresent++;
    if (r.isLate) { totalDaysLate++; totalLateMinutes += r.lateMinutes || 0; }
    if (r.status === 'HALF_DAY') halfDays++; else fullDays++;
    if (hours <= regularLimit) regularHours += hours;
    else { regularHours += regularLimit; overtimeHours += hours - regularLimit; }
  }

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month;
  const targetDayLimit  = isCurrentMonth ? Math.min(now.getDate(), totalDaysInMonth) : totalDaysInMonth;

  let elapsedWorkingDays = 0;
  for (let d = 1; d <= targetDayLimit; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) elapsedWorkingDays++;
  }

  const onLeaveDays = Math.max(0, elapsedWorkingDays - (fullDays + halfDays));
  const fullDayPay = fullDays * dailyRate;
  const halfDayPay = halfDays * halfDayRate;
  const onLeaveDeduction = onLeaveDays * dailyRate;
  const grossSalary = fullDayPay + halfDayPay;
  const relaxationMinsUsed = Math.min(totalLateMinutes, 240);
  const relaxationMinsRemaining = Math.max(0, 240 - relaxationMinsUsed);

  return {
    fullDays, halfDays, onLeaveDays,
    fullDayPay: round(fullDayPay), halfDayPay: round(halfDayPay),
    onLeaveDeduction: round(onLeaveDeduction), dailyRate: round(dailyRate),
    relaxationHoursUsed: round(relaxationMinsUsed / 60),
    relaxationHoursRemaining: round(relaxationMinsRemaining / 60),
    regularHours: round(regularHours), overtimeHours: round(overtimeHours),
    regularPay: round(fullDayPay),
    overtimePay: round(overtimeHours * (dailyRate / regularLimit) * 1.5),
    lateDeductions: 0, grossSalary: round(grossSalary),
    totalDaysPresent, totalDaysLate,
  };
}
