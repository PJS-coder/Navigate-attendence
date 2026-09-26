import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { SalaryBreakdown } from '@/types';

const round = (n: number) => parseFloat(n.toFixed(2));

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();

  const sp = req.nextUrl.searchParams;
  const year  = parseInt(sp.get('year')  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1), 10);

  try {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    // 1 single query for all users & 1 single query for all attendance records
    const [employees, allRecords] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          officeSsid: true,
          hourlyRate: true,
          createdAt: true,
          salaryRules: true,
        },
      }),
      prisma.attendance.findMany({
        where: { date: { gte: start, lte: end } },
      }),
    ]);

    // Group attendance records by userId in memory
    const recordsByUser = new Map<string, typeof allRecords>();
    for (const r of allRecords) {
      const list = recordsByUser.get(r.userId) || [];
      list.push(r);
      recordsByUser.set(r.userId, list);
    }

    // Pre-calculate month working days
    let workingDaysInMonth = 0;
    for (let d = 1; d <= totalDaysInMonth; d++) {
      if (new Date(year, month - 1, d).getDay() !== 0) workingDaysInMonth++;
    }

    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month;
    const targetDayLimit = isCurrentMonth ? Math.min(now.getDate(), totalDaysInMonth) : totalDaysInMonth;

    let elapsedWorkingDays = 0;
    for (let d = 1; d <= targetDayLimit; d++) {
      if (new Date(year, month - 1, d).getDay() !== 0) elapsedWorkingDays++;
    }

    let totalSalaryPayable = 0;
    let totalLeadsAssigned = 0;
    const employeePayrolls = [];

    for (const emp of employees) {
      const userRecords = recordsByUser.get(emp.id) || [];
      const monthlyBaseSalary = emp.hourlyRate > 0 ? emp.hourlyRate : 9000;
      const dailyRate = workingDaysInMonth > 0 ? monthlyBaseSalary / workingDaysInMonth : 0;
      const halfDayRate = dailyRate * 0.5;
      const regularLimit = emp.salaryRules?.workingHoursPerDay ?? 8;

      let fullDays = 0, halfDays = 0, regularHours = 0, overtimeHours = 0;
      let totalLateMinutes = 0, totalDaysPresent = 0, totalDaysLate = 0;
      let empLeads = 0, empSales = 0;

      for (const r of userRecords) {
        empLeads += r.leadsAssigned || 0;
        empSales += r.salesRevenue || 0;

        if (r.clockIn) {
          const hours = r.totalHours ?? 0;
          totalDaysPresent++;
          if (r.isLate) {
            totalDaysLate++;
            totalLateMinutes += r.lateMinutes || 0;
          }
          if (r.status === 'HALF_DAY') {
            halfDays++;
          } else if (r.status === 'PRESENT') {
            fullDays++;
          }
          if (hours <= regularLimit) {
            regularHours += hours;
          } else {
            regularHours += regularLimit;
            overtimeHours += hours - regularLimit;
          }
        }
      }

      totalLeadsAssigned += empLeads;

      const onLeaveDays = Math.max(0, elapsedWorkingDays - (fullDays + halfDays));
      const fullDayPay = fullDays * dailyRate;
      const halfDayPay = halfDays * halfDayRate;
      const onLeaveDeduction = onLeaveDays * dailyRate;
      const grossSalary = fullDayPay + halfDayPay;
      const relaxationMinsUsed = Math.min(totalLateMinutes, 240);
      const relaxationMinsRemaining = Math.max(0, 240 - relaxationMinsUsed);

      const breakdown: SalaryBreakdown = {
        fullDays,
        halfDays,
        onLeaveDays,
        fullDayPay: round(fullDayPay),
        halfDayPay: round(halfDayPay),
        onLeaveDeduction: round(onLeaveDeduction),
        dailyRate: round(dailyRate),
        relaxationHoursUsed: round(relaxationMinsUsed / 60),
        relaxationHoursRemaining: round(relaxationMinsRemaining / 60),
        regularHours: round(regularHours),
        overtimeHours: round(overtimeHours),
        regularPay: round(fullDayPay),
        overtimePay: round(overtimeHours * (dailyRate / Math.max(1, regularLimit)) * 1.5),
        lateDeductions: 0,
        grossSalary: round(grossSalary),
        totalDaysPresent,
        totalDaysLate,
      };

      totalSalaryPayable += grossSalary;

      employeePayrolls.push({
        user: {
          id: emp.id,
          name: emp.name,
          email: emp.email,
          role: emp.role,
          officeSsid: emp.officeSsid,
          hourlyRate: emp.hourlyRate,
          createdAt: emp.createdAt.toISOString(),
        },
        totalLeadsAssigned: empLeads,
        totalSalesRevenue: round(empSales),
        breakdown,
      });
    }

    return Response.json({
      success: true,
      year,
      month,
      totalSalaryPayable: round(totalSalaryPayable),
      totalLeadsAssigned,
      totalEmployees: employees.length,
      employees: employeePayrolls,
    });
  } catch (err) {
    return Response.json({ error: 'Failed to calculate payroll', details: String(err) }, { status: 500 });
  }
}

