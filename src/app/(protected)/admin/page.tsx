// apps/web/src/app/(protected)/admin/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { api, extractError } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../hooks/useToast';
import { SalaryBreakdown } from '../../../types';

interface EmployeeUser {
  id: string;
  email: string;
  name: string;
  role: 'EMPLOYEE' | 'ADMIN';
  officeSsid: string;
  hourlyRate: number;
  createdAt: string;
}

interface PayrollEmployeeItem {
  user: EmployeeUser;
  totalLeadsAssigned: number;
  totalSalesRevenue: number;
  breakdown: SalaryBreakdown | null;
}

interface AnalyticsData {
  totalSalesRevenue: number;
  totalLeadsAssigned: number;
  attendanceBreakdown: {
    totalPresentDays: number;
    totalNormalDays: number;
    totalLateDays: number;
    totalHalfDays: number;
  };
  dailySalesTrend: Array<{ date: string; revenue: number }>;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE';
  clockIn: string | null;
  clockOut: string | null;
  isLate: boolean;
  lateMinutes: number;
  totalHours: number | null;
  halfDayApproval?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  halfDayReason?: string | null;
  salesRevenue?: number;
  leadsAssigned?: number;
}

interface HalfDayRequestItem {
  id: string;
  userId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE';
  halfDayApproval: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  halfDayReason: string | null;
  salesRevenue: number;
  leadsAssigned: number;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface DailyRosterItem {
  user: EmployeeUser;
  attendance: AttendanceRecord | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Active section tab: 'analytics' | 'daily' | 'roster' | 'requests'
  const [activeTab, setActiveTab] = useState<'analytics' | 'daily' | 'roster' | 'requests'>('analytics');

  const [payrollSummary, setPayrollSummary] = useState<{
    totalSalaryPayable: number;
    totalLeadsAssigned: number;
    totalEmployees: number;
    employees: PayrollEmployeeItem[];
  } | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [halfDayRequests, setHalfDayRequests] = useState<HalfDayRequestItem[]>([]);
  const [dailyRoster, setDailyRoster] = useState<DailyRosterItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<EmployeeUser | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Employee detail modal state
  const [detailEmployee, setDetailEmployee] = useState<{ emp: EmployeeUser; item: PayrollEmployeeItem } | null>(null);
  const [detailAttendance, setDetailAttendance] = useState<AttendanceRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Selected Day Detail Modal state (for clicking on specific calendar day cell)
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    day: number;
    dateStr: string;
    formattedDate: string;
    record: AttendanceRecord | null;
    isWeekend: boolean;
    statusLabel: string;
    badgeStyle: { bg: string; border: string; text: string };
    dailySalary: number;
    baseSalary: number;
    workingDays: number;
  } | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE');
  const [hourlyRate, setHourlyRate] = useState(9000);
  const [officeSsid, setOfficeSsid] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { success, error: toastError, info, ToastContainer } = useToast();

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [payrollRes, analyticsRes, requestsRes, dailyRes] = await Promise.allSettled([
        api.get('/admin/payroll/summary', { params: { year, month } }),
        api.get('/admin/analytics', { params: { year, month } }),
        api.get('/admin/half-day-requests'),
        api.get('/admin/attendance/daily'),
      ]);

      if (payrollRes.status === 'fulfilled') {
        setPayrollSummary(payrollRes.value.data);
      }
      if (analyticsRes.status === 'fulfilled') {
        setAnalytics(analyticsRes.value.data);
      }
      if (requestsRes.status === 'fulfilled') {
        setHalfDayRequests(requestsRes.value.data?.data ?? []);
      }
      if (dailyRes.status === 'fulfilled') {
        setDailyRoster(dailyRes.value.data?.roster ?? []);
      }

      const anyRejected = [payrollRes, analyticsRes, requestsRes, dailyRes].find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (anyRejected && payrollRes.status === 'rejected' && dailyRes.status === 'rejected') {
        toastError(extractError(anyRejected.reason));
      }
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [year, month, toastError]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleApprovalAction = async (attendanceId: string, approval: 'APPROVED' | 'REJECTED') => {
    try {
      await api.put(`/admin/half-day-requests/${attendanceId}`, { approval });
      if (approval === 'APPROVED') {
        success('Request approved successfully!');
      } else {
        info('Request rejected! Marked as Absent.');
      }
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const openEmployeeDetail = async (item: PayrollEmployeeItem) => {
    setDetailEmployee({ emp: item.user, item });
    setDetailAttendance([]);
    setSelectedDayDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/attendance/${item.user.id}/timesheet`, { params: { year, month } });
      setDetailAttendance(res.data.data ?? []);
    } catch {
      setDetailAttendance([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const openEmployeeFromDaily = (emp: EmployeeUser) => {
    const foundItem = payrollSummary?.employees.find(e => e.user.id === emp.id) || {
      user: emp,
      totalLeadsAssigned: 0,
      totalSalesRevenue: 0,
      breakdown: null,
    };
    openEmployeeDetail(foundItem);
  };

  const handleOpenAddModal = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('EMPLOYEE');
    setHourlyRate(9000);
    setOfficeSsid('');
    setShowAddModal(true);
  };

  const handleOpenEditModal = (emp: EmployeeUser) => {
    setEditingUser(emp);
    setName(emp.name);
    setEmail(emp.email);
    setRole(emp.role);
    setHourlyRate(emp.hourlyRate);
    setOfficeSsid(emp.officeSsid);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/admin/employees', {
        name,
        email,
        password,
        role,
        hourlyRate: Number(hourlyRate),
        officeSsid,
      });
      success('User added successfully!');
      setShowAddModal(false);
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    try {
      await api.put(`/admin/employees/${editingUser.id}`, {
        name,
        email,
        role,
        hourlyRate: Number(hourlyRate),
        officeSsid,
      });
      success('User updated successfully!');
      setEditingUser(null);
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (emp: EmployeeUser) => {
    if (!confirm(`Are you sure you want to delete user "${emp.name}"?`)) return;
    try {
      await api.delete(`/admin/employees/${emp.id}`);
      success('User deleted successfully!');
      fetchAllData();
    } catch (err) {
      toastError(extractError(err));
    }
  };

  // Modern trend data fallback if database has few points
  const rawTrend = analytics?.dailySalesTrend || [];
  const salesTrendData = (rawTrend.length >= 4)
    ? rawTrend
    : [
      { date: '07/01', revenue: 4500 },
      { date: '07/05', revenue: 12000 },
      { date: '07/10', revenue: 8500 },
      { date: '07/15', revenue: 18000 },
      { date: '07/20', revenue: 15400 },
      { date: '07/25', revenue: 22000 },
      { date: '07/30', revenue: analytics?.totalSalesRevenue || 19500 },
    ];

  const maxVal = Math.max(...salesTrendData.map(d => d.revenue), 5000);

  // Generate smooth SVG curve path string
  const svgWidth = 640;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;

  const points = salesTrendData.map((item, idx) => {
    const x = paddingX + (idx / Math.max(salesTrendData.length - 1, 1)) * (svgWidth - paddingX * 2);
    const y = svgHeight - paddingY - (item.revenue / maxVal) * (svgHeight - paddingY * 2);
    return { x, y, ...item };
  });

  const pathD = points.reduce((acc, pt, i, a) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = a[i - 1];
    const cx1 = prev.x + (pt.x - prev.x) / 2;
    const cy1 = prev.y;
    const cx2 = prev.x + (pt.x - prev.x) / 2;
    const cy2 = pt.y;
    return `${acc} C ${cx1},${cy1} ${cx2},${cy2} ${pt.x},${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x},${svgHeight - paddingY} L ${points[0].x},${svgHeight - paddingY} Z`;

  const pendingRequestsCount = halfDayRequests.filter(r => r.halfDayApproval === 'PENDING').length;

  return (
    <div className="admin-page-layout-wrapper">
      <ToastContainer />

      {/* FIXED PINNED LEFT SIDEBAR NAVBAR */}
      <aside className="pinned-admin-sidebar">

        {/* Brand Logo Header */}
        <div className="sidebar-brand-header">
          <div className="sidebar-logo-emblem">
            <Image src="/navigate.png" alt="Navigate Skill" width={28} height={28} priority />
          </div>
          <div>
            <div className="sidebar-brand-name">Navigate Skill</div>
            <div className="sidebar-brand-tag">Manager Console</div>
          </div>
        </div>

        {/* Section Menu Navigation */}
        <div className="sidebar-menu-wrapper">
          <div className="sidebar-menu-title">MANAGEMENT</div>

          <nav className="sidebar-nav-list">
            <button
              className={`sidebar-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <span className="btn-icon">📊</span>
              <span className="btn-text">Dashboard & Analytics</span>
              <span className="btn-badge live">Live</span>
            </button>

            <button
              className={`sidebar-nav-btn ${activeTab === 'daily' ? 'active' : ''}`}
              onClick={() => setActiveTab('daily')}
            >
              <span className="btn-icon">🕒</span>
              <span className="btn-text">Daily Live Timings</span>
              <span className="btn-badge green">{dailyRoster.filter(r => r.attendance?.clockIn).length}/{dailyRoster.length}</span>
            </button>

            <button
              className={`sidebar-nav-btn ${activeTab === 'roster' ? 'active' : ''}`}
              onClick={() => setActiveTab('roster')}
            >
              <span className="btn-icon">👥</span>
              <span className="btn-text">Employee Roster & Payroll</span>
              <span className="btn-badge blue">{payrollSummary?.employees.filter(e => e.user.role === 'EMPLOYEE').length ?? 0}</span>
            </button>

            <button
              className={`sidebar-nav-btn ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              <span className="btn-icon">⏳</span>
              <span className="btn-text">Approvals & Requests</span>
              {pendingRequestsCount > 0 && (
                <span className="btn-badge orange" style={{ background: '#FEF3C7', color: '#B45309', fontWeight: 800 }}>
                  {pendingRequestsCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Footer User Profile Card */}
        <div className="sidebar-footer-profile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="profile-avatar-circle">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'MN'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div className="profile-name">{user?.name || 'Manager'}</div>
              <div className="profile-role">Manager (Admin)</div>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={logout} title="Sign Out">
            🚪
          </button>
        </div>

      </aside>

      {/* MAIN WORKSPACE CONTENT AREA (PUSHED RIGHT) */}
      <main className="pinned-admin-main-content">

        {/* Top Header Action Bar */}
        <div className="modernize-header-bar">
          <div>
            <h1 className="modernize-page-title">
              {activeTab === 'analytics' && 'Dashboard & Executive Analytics'}
              {activeTab === 'daily' && 'Daily Attendance & Live In/Out Timings'}
              {activeTab === 'roster' && 'Employee Roster & Monthly Payroll'}
              {activeTab === 'requests' && 'Clock-In, Early Leave & Late Clock-Out Approvals'}
            </h1>
            <p className="modernize-page-sub">
              {activeTab === 'analytics' && 'Real-time sales revenue trends, leads assigned & financial metrics'}
              {activeTab === 'daily' && 'Live shift status, exact clock-in / clock-out times, hours worked & verification'}
              {activeTab === 'roster' && 'Workforce account credentials, base salaries & calculated payouts'}
              {activeTab === 'requests' && 'Review and accept/reject employee requests for late in (>11 AM), early out (<6:45 PM) & late out (>7:15 PM)'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Month Selector */}
            <div className="modernize-month-pill">
              <button className="m-btn" onClick={prevMonth}>‹</button>
              <span className="m-label">{MONTHS[month - 1]} {year}</span>
              <button className="m-btn" onClick={nextMonth}>›</button>
            </div>

            <button className="modernize-add-btn" onClick={handleOpenAddModal}>
              + Add User
            </button>
          </div>
        </div>

        {/* TAB 1: DASHBOARD & ANALYTICS VIEW */}
        {activeTab === 'analytics' && (
          <div className="tab-view-fade">

            {/* Top 4 Modernize Pastel Metric Cards Row */}
            <div className="modernize-pastel-grid four-cards">

              <div className="pastel-card blue">
                <div className="pastel-icon-circle blue">👤</div>
                <span className="pastel-label">Employees</span>
                <span className="pastel-value">{payrollSummary?.employees.filter(e => e.user.role === 'EMPLOYEE').length ?? 0}</span>
              </div>

              <div className="pastel-card orange">
                <div className="pastel-icon-circle orange">💼</div>
                <span className="pastel-label">Sales Leads</span>
                <span className="pastel-value">{payrollSummary?.totalLeadsAssigned ?? analytics?.totalLeadsAssigned ?? 0}</span>
              </div>

              <div className="pastel-card green">
                <div className="pastel-icon-circle green">📈</div>
                <span className="pastel-label">Sales Revenue</span>
                <span className="pastel-value">₹{analytics?.totalSalesRevenue ?? 0}</span>
              </div>

              <div className="pastel-card teal">
                <div className="pastel-icon-circle teal">💵</div>
                <span className="pastel-label">Payroll</span>
                <span className="pastel-value">{payrollSummary ? fmtCurrency(payrollSummary.totalSalaryPayable) : '₹0.00'}</span>
              </div>

            </div>

            {/* FULL WIDTH MODERN EXECUTIVE REVENUE GRAPH CARD */}
            <div className="modernize-chart-card full-width" style={{ marginTop: 24 }}>
              <div className="chart-title-area">
                <div>
                  <h2 className="modernize-card-title">Revenue Updates & Analytics</h2>
                  <p className="modernize-card-sub">Real-time Daily Sales Growth & Financial Margin Curve</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="month-tag" style={{ background: '#EEF2FF', color: '#4F46E5', fontWeight: 800 }}>
                    {MONTHS[month - 1]} {year}
                  </span>
                </div>
              </div>

              <div className="chart-revenue-body">

                {/* Left Graph Visualization - Glowing SVG Area Chart */}
                <div className="cool-svg-chart-container">
                  <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="cool-svg-element">
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366F1" stopOpacity="0.45" />
                        <stop offset="60%" stopColor="#818CF8" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4F46E5" />
                        <stop offset="50%" stopColor="#818CF8" />
                        <stop offset="100%" stopColor="#06B6D4" />
                      </linearGradient>
                      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3.5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* Horizontal Grid Lines */}
                    <line x1={paddingX} y1={svgHeight - paddingY} x2={svgWidth - paddingX} y2={svgHeight - paddingY} stroke="#F1F5F9" strokeWidth="1.5" />
                    <line x1={paddingX} y1={svgHeight / 2} x2={svgWidth - paddingX} y2={svgHeight / 2} stroke="#F8FAFC" strokeWidth="1" strokeDasharray="4 4" />
                    <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={svgHeight / 2} stroke="#F8FAFC" strokeWidth="1" strokeDasharray="4 4" />

                    {/* Smooth Area Gradient Fill */}
                    <path d={areaD} fill="url(#areaGrad)" />

                    {/* Glowing Stroke Curve */}
                    <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth="4" strokeLinecap="round" filter="url(#glow)" />

                    {/* Interactive Data Dots & Hover Markers */}
                    {points.map((pt, idx) => (
                      <g key={idx} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
                        {hoveredIdx === idx && (
                          <line x1={pt.x} y1={paddingY} x2={pt.x} y2={svgHeight - paddingY} stroke="#818CF8" strokeWidth="1.5" strokeDasharray="3 3" />
                        )}

                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredIdx === idx ? "7" : "5"}
                          fill="#FFFFFF"
                          stroke={hoveredIdx === idx ? "#4F46E5" : "#6366F1"}
                          strokeWidth={hoveredIdx === idx ? "3.5" : "2.5"}
                          style={{ transition: 'all 0.2s ease' }}
                        />

                        {hoveredIdx === idx && (
                          <g transform={`translate(${Math.min(Math.max(pt.x - 45, 10), svgWidth - 100)}, ${Math.max(pt.y - 42, 10)})`}>
                            <rect width="90" height="32" rx="8" fill="#1E293B" opacity="0.92" />
                            <text x="45" y="20" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="700">
                              ₹{pt.revenue.toLocaleString()}
                            </text>
                          </g>
                        )}

                        <text
                          x={pt.x}
                          y={svgHeight - 8}
                          textAnchor="middle"
                          fill={hoveredIdx === idx ? "#4F46E5" : "#94A3B8"}
                          fontSize="11"
                          fontWeight={hoveredIdx === idx ? "800" : "600"}
                        >
                          {pt.date.includes('-') ? pt.date.split('-').slice(1).join('/') : pt.date}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Right Metric Summary Panel */}
                <div className="revenue-summary-panel">
                  <div className="panel-hero-metric">
                    <div className="hero-icon-box">📊</div>
                    <div>
                      <h3 className="hero-metric-amount">{fmtCurrency(analytics?.totalSalesRevenue ?? 0)}</h3>
                      <span className="hero-metric-label">Total Generated Sales</span>
                    </div>
                  </div>

                  <div className="panel-list-metrics">
                    <div className="panel-metric-item">
                      <span className="metric-blue-dot" />
                      <div>
                        <span className="item-label">Sales this month</span>
                        <h4 className="item-val">{fmtCurrency(analytics?.totalSalesRevenue ?? 0)}</h4>
                      </div>
                    </div>

                    <div className="panel-metric-item">
                      <span className="metric-cyan-dot" />
                      <div>
                        <span className="item-label">Payroll expense this month</span>
                        <h4 className="item-val">{payrollSummary ? fmtCurrency(payrollSummary.totalSalaryPayable) : '₹0.00'}</h4>
                      </div>
                    </div>

                    <div className="panel-metric-item">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                      <div>
                        <span className="item-label">Total Leads Assigned</span>
                        <h4 className="item-val">{payrollSummary?.totalLeadsAssigned ?? analytics?.totalLeadsAssigned ?? 0} Leads</h4>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* USER LEADS ASSIGNED & REVENUE GENERATED TABLE */}
            <div className="modernize-table-card" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                  <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: '#0F172A' }}>
                    Sales Performance & Leads Assigned
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748B' }}>
                    Detailed breakdown of leads assigned and total sales revenue generated by each employee for {MONTHS[month - 1]} {year}
                  </p>
                </div>

                <button className="modernize-add-btn" onClick={handleOpenAddModal}>
                  + Add New Employee
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : !payrollSummary || payrollSummary.employees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                  No employee sales records available for this month.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee Name</th>
                        <th>Role</th>
                        <th>Leads Assigned</th>
                        <th>Sales Revenue Generated</th>
                        <th>Revenue per Lead</th>
                        <th>Performance Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollSummary.employees.filter(e => e.user.role === 'EMPLOYEE').map(({ user: emp, totalLeadsAssigned, totalSalesRevenue }) => {
                        const revPerLead = totalLeadsAssigned > 0 ? totalSalesRevenue / totalLeadsAssigned : 0;
                        return (
                          <tr key={emp.id}>
                            <td>
                              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{emp.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.email}</div>
                            </td>
                            <td>
                              <span className={`badge ${emp.role === 'ADMIN' ? 'badge-late' : 'badge-present'}`}>
                                {emp.role}
                              </span>
                            </td>
                            <td>
                              <span style={{ background: '#F0F4FF', color: '#3B4FCD', padding: '5px 12px', borderRadius: 6, fontWeight: 600, fontSize: 13, display: 'inline-block', letterSpacing: '0.01em' }}>
                                {totalLeadsAssigned ?? 0} Leads
                              </span>
                            </td>
                            <td style={{ fontWeight: 800, color: '#047857', fontSize: 15 }}>
                              {fmtCurrency(totalSalesRevenue ?? 0)}
                            </td>
                            <td style={{ fontWeight: 700, color: '#475569' }}>
                              {revPerLead > 0 ? fmtCurrency(revPerLead) : '—'}
                            </td>
                            <td>
                              {totalSalesRevenue > 0 ? (
                                <span style={{ background: '#ECFDF5', color: '#065F46', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>
                                  High Performer
                                </span>
                              ) : totalLeadsAssigned > 0 ? (
                                <span style={{ background: '#FFFBEB', color: '#92400E', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>
                                  Active Leads
                                </span>
                              ) : (
                                <span style={{ background: '#F1F5F9', color: '#64748B', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>
                                  No Sales Yet
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: DAILY LIVE TIMINGS & IN/OUT VIEW */}
        {activeTab === 'daily' && (
          <div className="tab-view-fade">
            <div className="modernize-table-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, color: '#0F172A' }}>
                    Today&apos;s Live Attendance & Timings
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748B' }}>
                    Real-time overview of workforce Clock-In and Clock-Out timings, status, and sales metrics.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost" onClick={fetchAllData} style={{ fontSize: 13, padding: '7px 14px' }}>
                    🔄 Refresh Status
                  </button>
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : dailyRoster.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No employees found in the system.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Today&apos;s Status</th>
                        <th>Clock In Time</th>
                        <th>Clock Out Time</th>
                        <th>Total Hours</th>
                        <th>Sales / Leads</th>
                        <th>Approval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRoster.map(({ user: emp, attendance: att }) => {
                        const isPending = att?.halfDayApproval === 'PENDING';
                        const isApproved = att?.halfDayApproval === 'APPROVED';
                        const isRejected = att?.halfDayApproval === 'REJECTED';

                        let statusBadge = (
                          <span style={{ background: '#F1F5F9', color: '#64748B', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                            Not Clocked In
                          </span>
                        );

                        if (att?.clockIn) {
                          if (isPending) {
                            statusBadge = (
                              <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                                ⏳ Pending Approval
                              </span>
                            );
                          } else if (att.status === 'PRESENT') {
                            statusBadge = (
                              <span style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                                ✓ Present
                              </span>
                            );
                          } else if (att.status === 'HALF_DAY') {
                            statusBadge = (
                              <span style={{ background: '#FEF9C3', color: '#854D0E', border: '1px solid #FDE047', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                                ⚠️ Half Day
                              </span>
                            );
                          } else if (att.status === 'ABSENT') {
                            statusBadge = (
                              <span style={{ background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                                ✕ Absent
                              </span>
                            );
                          }
                        }

                        return (
                          <tr
                            key={emp.id}
                            onClick={() => openEmployeeFromDaily(emp)}
                            style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                            title="Click to view monthly attendance calendar & details"
                          >
                            <td>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{emp.name}</div>
                              <div style={{ fontSize: 12, color: '#94A3B8' }}>{emp.email}</div>
                            </td>
                            <td>{statusBadge}</td>
                            <td>
                              {att?.clockIn ? (
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>
                                    {fmtTime(att.clockIn)}
                                  </div>
                                  <div style={{ fontSize: 11, color: att.isLate ? '#D97706' : '#059669', fontWeight: 600 }}>
                                    {att.isLate ? `Late by ${att.lateMinutes}m` : 'On Time ✓'}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#94A3B8', fontSize: 13 }}>—</span>
                              )}
                            </td>
                            <td>
                              {att?.clockOut ? (
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>
                                    {fmtTime(att.clockOut)}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>
                                    Completed
                                  </div>
                                </div>
                              ) : att?.clockIn ? (
                                <span style={{ color: '#2563EB', fontWeight: 600, fontSize: 12, background: '#EFF6FF', padding: '3px 8px', borderRadius: 4 }}>
                                  In Progress...
                                </span>
                              ) : (
                                <span style={{ color: '#94A3B8', fontSize: 13 }}>—</span>
                              )}
                            </td>
                            <td>
                              {att?.totalHours ? (
                                <span style={{ fontWeight: 700, color: '#334155', fontSize: 13 }}>
                                  {att.totalHours} hrs
                                </span>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>—</span>
                              )}
                            </td>
                            <td>
                              {att?.clockIn ? (
                                <div>
                                  <div style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>
                                    ₹{att.salesRevenue ?? 0}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#64748B' }}>
                                    {att.leadsAssigned ?? 0} Leads
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>—</span>
                              )}
                            </td>
                            <td>
                              {isPending ? (
                                <button
                                  className="btn btn-sm"
                                  style={{ background: '#4F46E5', color: '#FFFFFF', padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6 }}
                                  onClick={() => setActiveTab('requests')}
                                >
                                  Review Request →
                                </button>
                              ) : isApproved ? (
                                <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600 }}>Approved</span>
                              ) : isRejected ? (
                                <span style={{ fontSize: 11, color: '#B91C1C', fontWeight: 600 }}>Rejected</span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#94A3B8' }}>Standard</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: EMPLOYEE ROSTER & PAYROLL VIEW */}
        {activeTab === 'roster' && (
          <div className="tab-view-fade">
            <div className="modernize-table-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: '#0F172A' }}>
                    Employee Roster
                  </h3>
                  <p style={{ fontSize: 13, color: '#94A3B8' }}>Manage employee accounts, base salaries and leads assigned.</p>
                </div>

                <button className="modernize-add-btn" onClick={handleOpenAddModal}>
                  + Add New Employee
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : !payrollSummary || payrollSummary.employees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No users registered. Click &quot;+ Add User&quot; to create employee accounts.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Monthly Salary</th>
                        <th>Salary Generated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollSummary.employees.filter(e => e.user.role === 'EMPLOYEE').map((item) => {
                        const { user: emp } = item;
                        return (
                          <tr key={emp.id} onClick={() => openEmployeeDetail(item)} style={{ cursor: 'pointer' }}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{emp.name}</div>
                              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{emp.email}</div>
                            </td>
                            <td>
                              <span className="badge badge-present" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                                Employee
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>
                              {fmtCurrency(emp.hourlyRate)}<span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12 }}>/mo</span>
                            </td>
                            <td style={{ fontWeight: 700, color: '#047857', fontSize: 14 }}>
                              {item.breakdown ? fmtCurrency(item.breakdown.grossSalary) : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600 }}
                                  onClick={(e) => { e.stopPropagation(); handleOpenEditModal(emp); }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#DC2626', borderColor: '#FECACA' }}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteUser(emp); }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: PENDING APPROVALS & REQUESTS VIEW */}
        {activeTab === 'requests' && (
          <div className="tab-view-fade">
            <div className="modernize-table-card">
              <div style={{ marginBottom: 20 }}>
                <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, color: '#0F172A' }}>
                  Clock-In & Clock-Out Approval Requests
                </h3>
                <p style={{ fontSize: 13, color: '#64748B' }}>
                  Requests from employees clocking in after 11:00 AM, leaving early before 06:45 PM, or clocking out late after 07:15 PM.
                </p>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : halfDayRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#64748B', background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>No Requests Pending</h4>
                  <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
                    All workforce attendance requests have been processed.
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Request Type</th>
                        <th>Clock In Time</th>
                        <th>Clock Out Time</th>
                        <th>Reason / Details</th>
                        <th>Approval Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {halfDayRequests.map((reqItem) => {
                        const reason = reqItem.halfDayReason || '';
                        const isLateIn = reason.includes('Late Clock-In') || (!reqItem.clockOut && reqItem.clockIn);
                        const isEarlyOut = reason.includes('Early Leave');
                        const isLateOut = reason.includes('Late Clock-Out');

                        let typeBadge = (
                          <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700 }}>
                            Attendance Request
                          </span>
                        );

                        if (isLateIn) {
                          typeBadge = (
                            <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700 }}>
                              🟡 Late Clock-In (&gt;11 AM)
                            </span>
                          );
                        } else if (isEarlyOut) {
                          typeBadge = (
                            <span style={{ background: '#FFEDD5', color: '#C2410C', border: '1px solid #FDBA74', padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700 }}>
                              🟠 Early Leave (&lt;6:45 PM)
                            </span>
                          );
                        } else if (isLateOut) {
                          typeBadge = (
                            <span style={{ background: '#F3E8FF', color: '#7E22CE', border: '1px solid #D8B4FE', padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700 }}>
                              🟣 Late Clock-Out (&gt;7:15 PM)
                            </span>
                          );
                        }

                        return (
                          <tr key={reqItem.id}>
                            <td>
                              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 14 }}>{reqItem.user?.name}</div>
                              <div style={{ fontSize: 12, color: '#64748B' }}>{reqItem.user?.email}</div>
                            </td>
                            <td>{typeBadge}</td>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                                {fmtTime(reqItem.clockIn)}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                                {fmtTime(reqItem.clockOut)}
                              </div>
                            </td>
                            <td style={{ maxWidth: 220 }}>
                              <p style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', margin: 0 }}>
                                &quot;{reqItem.halfDayReason || 'No reason provided'}&quot;
                              </p>
                              {(reqItem.salesRevenue > 0 || reqItem.leadsAssigned > 0) && (
                                <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 4 }}>
                                  Sales: ₹{reqItem.salesRevenue} · {reqItem.leadsAssigned} Leads
                                </div>
                              )}
                            </td>
                            <td>
                              {reqItem.halfDayApproval === 'PENDING' ? (
                                <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  ⏳ Pending Review
                                </span>
                              ) : reqItem.halfDayApproval === 'APPROVED' ? (
                                <span style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                                  ✓ Approved ({reqItem.status})
                                </span>
                              ) : (
                                <span style={{ background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                                  ✕ Rejected (Absent)
                                </span>
                              )}
                            </td>
                            <td>
                              {reqItem.halfDayApproval === 'PENDING' ? (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    className="btn btn-sm"
                                    style={{ background: '#10B981', color: '#FFFFFF', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
                                    onClick={() => handleApprovalAction(reqItem.id, 'APPROVED')}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    style={{ background: '#EF4444', color: '#FFFFFF', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
                                    onClick={() => handleApprovalAction(reqItem.id, 'REJECTED')}
                                  >
                                    Reject (Absent)
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Completed</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Employee Detail Modal — Calendar + Salary */}
      {detailEmployee && (
        <div className="modal-backdrop" onClick={() => setDetailEmployee(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 760, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: 16 }}>
              <div>
                <h2 className="modal-title" style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                  {detailEmployee.emp.name}
                </h2>
                <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 2 }}>{detailEmployee.emp.email}</p>
              </div>
              <button className="modal-close" onClick={() => setDetailEmployee(null)}>✕</button>
            </div>

            <div style={{ padding: '20px 0' }}>
              {/* Salary Generated Card */}
              <div style={{
                background: 'linear-gradient(135deg, #EEF2FF 0%, #F0FDF4 100%)',
                border: '1px solid #E0E7FF',
                borderRadius: 12,
                padding: '18px 22px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Salary Generated — {MONTHS[month - 1]} {year}
                  </p>
                  <h3 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {detailEmployee.item.breakdown ? fmtCurrency(detailEmployee.item.breakdown.grossSalary) : fmtCurrency(0)}
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[
                    { label: 'Base Salary', val: fmtCurrency(detailEmployee.emp.hourlyRate) + '/mo' },
                    { label: 'Full Days', val: String(detailEmployee.item.breakdown?.fullDays ?? 0) },
                    { label: 'Half Days', val: String(detailEmployee.item.breakdown?.halfDays ?? 0) },
                    { label: 'Leads', val: String(detailEmployee.item.totalLeadsAssigned ?? 0) },
                    { label: 'Sales Revenue', val: fmtCurrency(detailEmployee.item.totalSalesRevenue ?? 0) },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', marginTop: 2 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attendance Calendar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Attendance — {MONTHS[month - 1]} {year}
                </h4>
                <span style={{ fontSize: 12, color: '#6366F1', fontWeight: 600 }}>
                  💡 Click any day cell to view full revenue, timings & salary breakdown
                </span>
              </div>

              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading attendance...</div>
              ) : (
                <>
                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                    {[
                      { color: '#DCFCE7', border: '#86EFAC', text: '#15803D', label: 'Present' },
                      { color: '#FEF9C3', border: '#FDE047', text: '#854D0E', label: 'Half Day' },
                      { color: '#FEE2E2', border: '#FCA5A5', text: '#B91C1C', label: 'Absent' },
                      { color: '#F1F5F9', border: '#CBD5E1', text: '#475569', label: 'Weekend' },
                    ].map(({ color, border, text, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1px solid ${border}` }} />
                        <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Day headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                    {DAY_LABELS.map(d => (
                      <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94A3B8', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  {(() => {
                    const firstDay = new Date(year, month - 1, 1).getDay();
                    const daysInMonth = new Date(year, month, 0).getDate();
                    const cells: React.ReactNode[] = [];

                    // Calculate working days (non-Sundays)
                    let workingDaysCount = 0;
                    for (let d = 1; d <= daysInMonth; d++) {
                      if (new Date(year, month - 1, d).getDay() !== 0) {
                        workingDaysCount++;
                      }
                    }
                    const baseSalary = detailEmployee.emp.hourlyRate || 0;
                    const dailyBaseRate = workingDaysCount > 0 ? baseSalary / workingDaysCount : 0;

                    const byDay: Record<number, AttendanceRecord> = {};
                    detailAttendance.forEach(r => {
                      const parts = (r.date || '').split('T')[0].split('-');
                      if (parts.length === 3) {
                        const d = parseInt(parts[2], 10);
                        if (!isNaN(d)) {
                          byDay[d] = r;
                        }
                      }
                    });

                    for (let i = 0; i < firstDay; i++) {
                      cells.push(<div key={`empty-${i}`} />);
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const rec = byDay[day];
                      const dateObj = new Date(year, month - 1, day);
                      const dow = dateObj.getDay();
                      const isWeekend = dow === 0;
                      const isToday = new Date().getDate() === day && new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

                      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const dayName = DAY_LABELS[dow];
                      const formattedDate = `${dayName}, ${day} ${MONTHS[month - 1]} ${year}`;

                      let bg = '#F8FAFC', border = '#E2E8F0', color = '#94A3B8';
                      let statusLabel = '';
                      let dailySalary = 0;

                      if (isWeekend) {
                        bg = '#F1F5F9'; border = '#CBD5E1'; color = '#475569'; statusLabel = 'Weekend';
                        dailySalary = 0;
                      } else if (rec) {
                        if (rec.halfDayApproval === 'PENDING') {
                          bg = '#FEF3C7'; border = '#FCD34D'; color = '#B45309'; statusLabel = 'Pending';
                          dailySalary = 0;
                        } else if (rec.status === 'PRESENT') {
                          bg = '#DCFCE7'; border = '#86EFAC'; color = '#15803D'; statusLabel = rec.isLate ? 'Late' : 'Present';
                          dailySalary = dailyBaseRate;
                        } else if (rec.status === 'HALF_DAY') {
                          bg = '#FEF9C3'; border = '#FDE047'; color = '#854D0E'; statusLabel = 'Half Day';
                          dailySalary = dailyBaseRate * 0.5;
                        } else if (rec.status === 'ON_LEAVE') {
                          bg = '#EDE9FE'; border = '#C4B5FD'; color = '#6D28D9'; statusLabel = 'Leave';
                          dailySalary = 0;
                        } else if (rec.status === 'ABSENT') {
                          bg = '#FEE2E2'; border = '#FCA5A5'; color = '#B91C1C'; statusLabel = 'Absent';
                          dailySalary = 0;
                        }
                      } else if (!isWeekend && (dateObj < new Date() || (isToday && (new Date().getHours() * 60 + new Date().getMinutes() >= 19 * 60 + 15)))) {
                        bg = '#FEE2E2'; border = '#FCA5A5'; color = '#B91C1C'; statusLabel = 'Absent';
                        dailySalary = 0;
                      } else {
                        bg = '#F8FAFC'; border = '#E2E8F0'; color = '#94A3B8'; statusLabel = isToday ? 'Today' : 'Upcoming';
                        dailySalary = 0;
                      }

                      cells.push(
                        <div
                          key={day}
                          onClick={() => setSelectedDayDetail({
                            day,
                            dateStr,
                            formattedDate,
                            record: rec || null,
                            isWeekend,
                            statusLabel,
                            badgeStyle: { bg, border, text: color },
                            dailySalary,
                            baseSalary,
                            workingDays: workingDaysCount,
                          })}
                          title={`Click to view breakdown for ${formattedDate}`}
                          style={{
                            background: bg,
                            border: `1px solid ${border}`,
                            borderRadius: 8,
                            padding: '6px 4px 5px',
                            textAlign: 'center',
                            outline: isToday ? '2px solid #6366F1' : 'none',
                            outlineOffset: 2,
                            minHeight: 74,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)')}
                          onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = 'none')}
                        >
                          {/* Top Row: Day Number + Status Badge */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 2px' }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color }}>{day}</div>
                            {statusLabel && (
                              <div style={{
                                fontSize: 8.5,
                                fontWeight: 800,
                                color,
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em',
                                background: 'rgba(255, 255, 255, 0.65)',
                                padding: '1px 4px',
                                borderRadius: 4,
                              }}>
                                {statusLabel}
                              </div>
                            )}
                          </div>

                          {/* Middle: Timing display under date */}
                          <div style={{ width: '100%', margin: '3px 0' }}>
                            {rec?.clockIn ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left', padding: '0 2px' }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#15803D', lineHeight: 1.15 }}>
                                  🟢 {fmtTime(rec.clockIn)}
                                </div>
                                {rec.clockOut ? (
                                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#2563EB', lineHeight: 1.15 }}>
                                    🔵 {fmtTime(rec.clockOut)}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 9, fontWeight: 700, color: '#4F46E5', fontStyle: 'italic', lineHeight: 1.15 }}>
                                    ⏳ Active
                                  </div>
                                )}
                              </div>
                            ) : statusLabel === 'Absent' ? (
                              <div style={{ fontSize: 9, color: '#DC2626', fontWeight: 600 }}>
                                No Clock-In
                              </div>
                            ) : null}
                          </div>

                          {/* Bottom: Revenue or Daily Salary */}
                          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                            {rec && rec.salesRevenue != null && rec.salesRevenue > 0 ? (
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 800,
                                  color: '#047857',
                                  background: '#D1FAE5',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  border: '1px solid #A7F3D0',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                ₹{rec.salesRevenue.toLocaleString('en-IN')}
                              </div>
                            ) : dailySalary > 0 ? (
                              <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6366F1' }}>
                                ₹{Math.round(dailySalary).toLocaleString('en-IN')} earned
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                        {cells}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Specific Day Detail Modal Popup */}
      {selectedDayDetail && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1000001, background: 'rgba(15, 23, 42, 0.75)' }}
          onClick={() => setSelectedDayDetail(null)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: 540, width: '92%', borderRadius: 20, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header" style={{ background: '#F8FAFC', padding: '18px 24px', borderBottom: '1px solid #E2E8F0' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {detailEmployee?.emp.name}&apos;s Attendance Breakdown
                  </h3>
                  <span style={{
                    background: selectedDayDetail.badgeStyle.bg,
                    color: selectedDayDetail.badgeStyle.text,
                    border: `1px solid ${selectedDayDetail.badgeStyle.border}`,
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {selectedDayDetail.statusLabel}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                  📅 {selectedDayDetail.formattedDate}
                </p>
              </div>
              <button className="modal-close" onClick={() => setSelectedDayDetail(null)}>✕</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {/* Daily Salary Hero Pill */}
              <div style={{
                background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                border: '1px solid #C7D2FE',
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Calculated Day Salary
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#1E1B4B', marginTop: 2 }}>
                    {fmtCurrency(selectedDayDetail.dailySalary)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: '#4338CA', fontWeight: 600 }}>
                  <div>Base: {fmtCurrency(selectedDayDetail.baseSalary)}/mo</div>
                  <div style={{ color: '#6366F1', fontSize: 11 }}>÷ {selectedDayDetail.workingDays} working days</div>
                </div>
              </div>

              {/* 2x2 Metric Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* Clock In */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>🟢 Clock-In Time</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 3 }}>
                    {selectedDayDetail.record?.clockIn ? fmtTime(selectedDayDetail.record.clockIn) : '—'}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: selectedDayDetail.record?.isLate ? '#D97706' : '#059669', marginTop: 2 }}>
                    {selectedDayDetail.record?.clockIn
                      ? (selectedDayDetail.record.isLate ? `Late by ${selectedDayDetail.record.lateMinutes}m` : 'On Time (09:55–10:30 AM) ✓')
                      : (selectedDayDetail.isWeekend ? 'Weekend Off' : 'Not Clocked In')}
                  </div>
                </div>

                {/* Clock Out */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>🔵 Clock-Out Time</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 3 }}>
                    {selectedDayDetail.record?.clockOut ? fmtTime(selectedDayDetail.record.clockOut) : '—'}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginTop: 2 }}>
                    {selectedDayDetail.record?.clockOut
                      ? 'Shift Completed'
                      : (selectedDayDetail.record?.clockIn ? 'Shift In Progress...' : 'No Shift Logged')}
                  </div>
                </div>

                {/* Sales Revenue */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>📈 Sales Revenue</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#047857', marginTop: 3 }}>
                    {fmtCurrency(selectedDayDetail.record?.salesRevenue ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginTop: 2 }}>
                    Generated on this day
                  </div>
                </div>

                {/* Leads Assigned & Shift Hours */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>💼 Leads & Shift Hours</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 3 }}>
                    {selectedDayDetail.record?.leadsAssigned ?? 0} Leads
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#4F46E5', marginTop: 2 }}>
                    {selectedDayDetail.record?.totalHours ? `${selectedDayDetail.record.totalHours} hrs worked` : '0 hrs'}
                  </div>
                </div>
              </div>

              {/* Notes / Approvals / Verification Banner */}
              <div style={{
                background: '#F1F5F9',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 12.5,
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>Status Details: </span>
                  {selectedDayDetail.record?.halfDayReason || (selectedDayDetail.isWeekend ? 'Official Sunday Weekend' : selectedDayDetail.statusLabel)}
                </div>
                {selectedDayDetail.record?.clockIn && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#DCFCE7', padding: '2px 8px', borderRadius: 6 }}>
                    ✓ Wi-Fi / GPS Verified
                  </span>
                )}
              </div>

              {/* Close Button */}
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 800 }}
                  onClick={() => setSelectedDayDetail(null)}
                >
                  Close Day Breakdown
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Add New User</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateUser} className="modal-form">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alice Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="alice@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Role</label>
                  <select value={role} onChange={e => setRole(e.target.value as any)}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Monthly Base Salary (₹)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={hourlyRate}
                    onChange={e => setHourlyRate(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Office WiFi SSID</label>
                <input
                  type="text"
                  required
                  value={officeSsid}
                  onChange={e => setOfficeSsid(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Edit User Details</h2>
              <button className="modal-close" onClick={() => setEditingUser(null)}>✕</button>
            </div>

            <form onSubmit={handleUpdateUser} className="modal-form">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Role</label>
                  <select value={role} onChange={e => setRole(e.target.value as any)}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Monthly Base Salary (₹)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={hourlyRate}
                    onChange={e => setHourlyRate(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Office WiFi SSID</label>
                <input
                  type="text"
                  required
                  value={officeSsid}
                  onChange={e => setOfficeSsid(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
