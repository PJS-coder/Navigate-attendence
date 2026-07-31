import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth';
import { calculateMonthlySalary } from '@/lib/salary';

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();
  const sp = req.nextUrl.searchParams;
  const year  = parseInt(sp.get('year')  ?? String(new Date().getFullYear()), 10);
  const month = parseInt(sp.get('month') ?? String(new Date().getMonth() + 1), 10);
  try {
    const employees = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, officeSsid: true, hourlyRate: true, createdAt: true } });
    const start = new Date(year, month - 1, 1), end = new Date(year, month, 0, 23, 59, 59);
    let totalSalaryPayable = 0, totalLeadsAssigned = 0;
    const employeePayrolls = [];
    for (const emp of employees) {
      try {
        const breakdown = await calculateMonthlySalary(emp.id, year, month);
        totalSalaryPayable += breakdown.grossSalary;
        const recs = await prisma.attendance.findMany({ where: { userId: emp.id, date: { gte: start, lte: end } }, select: { leadsAssigned: true, salesRevenue: true } });
        const empLeads = recs.reduce((s, r) => s + (r.leadsAssigned || 0), 0);
        const empSales = recs.reduce((s, r) => s + (r.salesRevenue || 0), 0);
        totalLeadsAssigned += empLeads;
        employeePayrolls.push({ user: emp, totalLeadsAssigned: empLeads, totalSalesRevenue: parseFloat(empSales.toFixed(2)), breakdown });
      } catch (err) {
        employeePayrolls.push({ user: emp, totalLeadsAssigned: 0, totalSalesRevenue: 0, breakdown: null, error: String(err) });
      }
    }
    return Response.json({ success: true, year, month, totalSalaryPayable: parseFloat(totalSalaryPayable.toFixed(2)), totalLeadsAssigned, totalEmployees: employees.length, employees: employeePayrolls });
  } catch (err) {
    return Response.json({ error: 'Failed to calculate payroll', details: String(err) }, { status: 500 });
  }
}
