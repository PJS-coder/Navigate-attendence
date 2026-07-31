// apps/web/src/types/index.ts

export type Role = 'EMPLOYEE' | 'ADMIN';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'HALF_DAY';
export type HalfDayApproval = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  officeSsid: string;
  hourlyRate: number;
  createdAt: string;
  salaryRules?: SalaryRule;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number | null;
  status: AttendanceStatus;
  isLate: boolean;
  lateMinutes: number;
  wifiVerified: boolean;
  salesRevenue?: number;
  halfDayApproval?: HalfDayApproval;
  halfDayReason?: string | null;
}

export interface SalaryRule {
  id: string;
  userId: string;
  baseSalary: number;
  overtimeMultiplier: number;
  latePenaltyPerMin: number;
  officeStartTime: string;
  workingHoursPerDay: number;
}

export interface SalaryBreakdown {
  fullDays: number;
  halfDays: number;
  onLeaveDays: number;
  fullDayPay: number;
  halfDayPay: number;
  onLeaveDeduction: number;
  dailyRate: number;
  relaxationHoursUsed: number;
  relaxationHoursRemaining: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  lateDeductions: number;
  grossSalary: number;
  totalDaysPresent: number;
  totalDaysLate: number;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export interface EmployeeWithCount extends User {
  salaryRules: SalaryRule | undefined;
  _count: { attendances: number };
}
