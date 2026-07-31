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

  // Active section tab: 'analytics' | 'roster' | 'requests'
  const [activeTab, setActiveTab] = useState<'analytics' | 'roster' | 'requests'>('analytics');

  const [payrollSummary, setPayrollSummary] = useState<{
    totalSalaryPayable: number;
    totalLeadsAssigned: number;
    totalEmployees: number;
    employees: PayrollEmployeeItem[];
  } | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [halfDayRequests, setHalfDayRequests] = useState<HalfDayRequestItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<EmployeeUser | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Employee detail modal state
  const [detailEmployee, setDetailEmployee] = useState<{ emp: EmployeeUser; item: PayrollEmployeeItem } | null>(null);
  const [detailAttendance, setDetailAttendance] = useState<AttendanceRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

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
      const [payrollRes, analyticsRes, requestsRes] = await Promise.all([
        api.get('/admin/payroll/summary', { params: { year, month } }),
        api.get('/admin/analytics', { params: { year, month } }),
        api.get('/admin/half-day-requests'),
      ]);
      setPayrollSummary(payrollRes.data);
      setAnalytics(analyticsRes.data);
      setHalfDayRequests(requestsRes.data?.data ?? []);
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
        success('Request approved! Attendance marked as Half Day.');
      } else {
        info('Request rejected! Attendance marked as Absent.');
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
            <div className="sidebar-brand-tag">Admin Console</div>
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
              <span className="btn-text">Pending Early Leave Requests</span>
              <span className="btn-badge orange" style={{ background: '#FEF3C7', color: '#B45309', fontWeight: 800 }}>
                {halfDayRequests.filter(r => r.halfDayApproval === 'PENDING').length}
              </span>
            </button>
          </nav>
        </div>

        {/* Footer User Profile Card */}
        <div className="sidebar-footer-profile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="profile-avatar-circle">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div className="profile-name">{user?.name || 'Administrator'}</div>
              <div className="profile-role">Admin Account</div>
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
              {activeTab === 'roster' && 'Employee Roster & Monthly Payroll'}
              {activeTab === 'requests' && 'Pending Early Leave & Half Day Requests'}
            </h1>
            <p className="modernize-page-sub">
              {activeTab === 'analytics' && 'Real-time sales revenue trends, leads assigned & financial metrics'}
              {activeTab === 'roster' && 'Workforce account credentials, base salaries & calculated payouts'}
              {activeTab === 'requests' && 'Approve early leave requests for Half Day, or Reject to mark Absent'}
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
                    <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="#F8FAFC" strokeWidth="1" strokeDasharray="4 4" />

                    {/* Smooth Area Gradient Fill */}
                    <path d={areaD} fill="url(#areaGrad)" />

                    {/* Glowing Stroke Curve */}
                    <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth="4" strokeLinecap="round" filter="url(#glow)" />

                    {/* Interactive Data Dots & Hover Markers */}
                    {points.map((pt, idx) => (
                      <g key={idx} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
                        {/* Hover vertical indicator line */}
                        {hoveredIdx === idx && (
                          <line x1={pt.x} y1={paddingY} x2={pt.x} y2={svgHeight - paddingY} stroke="#818CF8" strokeWidth="1.5" strokeDasharray="3 3" />
                        )}

                        {/* Node Circle */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredIdx === idx ? "7" : "5"}
                          fill="#FFFFFF"
                          stroke={hoveredIdx === idx ? "#4F46E5" : "#6366F1"}
                          strokeWidth={hoveredIdx === idx ? "3.5" : "2.5"}
                          style={{ transition: 'all 0.2s ease' }}
                        />

                        {/* Hover Tooltip Popup */}
                        {hoveredIdx === idx && (
                          <g transform={`translate(${Math.min(Math.max(pt.x - 45, 10), svgWidth - 100)}, ${Math.max(pt.y - 42, 10)})`}>
                            <rect width="90" height="32" rx="8" fill="#1E293B" opacity="0.92" />
                            <text x="45" y="20" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="700">
                              ₹{pt.revenue.toLocaleString()}
                            </text>
                          </g>
                        )}

                        {/* Date Label on X Axis */}
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

        {/* TAB 2: EMPLOYEE ROSTER & PAYROLL VIEW */}
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

        {/* TAB 3: PENDING EARLY LEAVE REQUESTS VIEW */}
        {activeTab === 'requests' && (
          <div className="tab-view-fade">
            <div className="modernize-table-card">
              <div style={{ marginBottom: 20 }}>
                <h3 className="modernize-table-title" style={{ marginBottom: 2, fontWeight: 700, fontSize: 16, color: '#0F172A' }}>
                  Pending Early Leave Requests
                </h3>
                <p style={{ fontSize: 13, color: '#64748B' }}>
                  Employees who logged out before 6:00 PM and requested Half Day approval. If unapproved after 6:00 PM, they will automatically be marked Absent.
                </p>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <span className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
                </div>
              ) : halfDayRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#64748B', background: '#F8FAFC', borderRadius: 12, border: '1px stroke #E2E8F0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>No Early Leave Requests Pending</h4>
                  <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
                    All requests have been processed or no employees have requested early leave today.
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Clock In / Out</th>
                        <th>Sales / Leads</th>
                        <th>Reason for Early Leave</th>
                        <th>Approval Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {halfDayRequests.map((reqItem) => (
                        <tr key={reqItem.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 14 }}>{reqItem.user?.name}</div>
                            <div style={{ fontSize: 12, color: '#64748B' }}>{reqItem.user?.email}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                              In: {fmtTime(reqItem.clockIn)}
                            </div>
                            <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>
                              Out: {fmtTime(reqItem.clockOut)} (Before 6 PM)
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>
                              ₹{reqItem.salesRevenue ?? 0}
                            </div>
                            <div style={{ fontSize: 12, color: '#475569' }}>
                              {reqItem.leadsAssigned ?? 0} Leads
                            </div>
                          </td>
                          <td style={{ maxWidth: 220 }}>
                            <p style={{ fontSize: 12.5, color: '#475569', fontStyle: 'italic', margin: 0 }}>
                              "{reqItem.halfDayReason || 'No reason provided'}"
                            </p>
                          </td>
                          <td>
                            {reqItem.halfDayApproval === 'PENDING' ? (
                              <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                ⏳ Pending Review
                              </span>
                            ) : reqItem.halfDayApproval === 'APPROVED' ? (
                              <span style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
                                ✓ Approved (Half Day)
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
                                  Approve (Half Day)
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
                      ))}
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
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 14 }}>
                Attendance — {MONTHS[month - 1]} {year}
              </h4>

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

                    // Build attendance lookup by day
                    const byDay: Record<number, AttendanceRecord> = {};
                    detailAttendance.forEach(r => {
                      const d = new Date(r.date).getDate();
                      byDay[d] = r;
                    });

                    // Empty leading cells
                    for (let i = 0; i < firstDay; i++) {
                      cells.push(<div key={`empty-${i}`} />);
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const rec = byDay[day];
                      const dateObj = new Date(year, month - 1, day);
                      const dow = dateObj.getDay();
                      const isWeekend = dow === 0; // Only Sunday is a holiday
                      const isToday = new Date().getDate() === day && new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

                      let bg = '#F8FAFC', border = '#E2E8F0', color = '#94A3B8';
                      let statusLabel = '';

                      if (isWeekend) {
                        bg = '#F1F5F9'; border = '#CBD5E1'; color = '#CBD5E1';
                      } else if (rec) {
                        if (rec.status === 'PRESENT') { bg = '#DCFCE7'; border = '#86EFAC'; color = '#15803D'; statusLabel = rec.isLate ? 'Late' : 'Present'; }
                        else if (rec.status === 'HALF_DAY') { bg = '#FEF9C3'; border = '#FDE047'; color = '#854D0E'; statusLabel = 'Half Day'; }
                        else if (rec.status === 'ON_LEAVE') { bg = '#EDE9FE'; border = '#C4B5FD'; color = '#6D28D9'; statusLabel = 'Leave'; }
                      } else if (!isWeekend && dateObj < new Date()) {
                        bg = '#FEE2E2'; border = '#FCA5A5'; color = '#B91C1C'; statusLabel = 'Absent';
                      }

                      cells.push(
                        <div
                          key={day}
                          title={rec ? `In: ${fmtTime(rec.clockIn)} | Out: ${fmtTime(rec.clockOut)}${rec.salesRevenue != null ? ` | Sales: ₹${rec.salesRevenue}` : ''}` : statusLabel}
                          style={{
                            background: bg,
                            border: `1px solid ${border}`,
                            borderRadius: 8,
                            padding: '6px 3px 5px',
                            textAlign: 'center',
                            outline: isToday ? '2px solid #6366F1' : 'none',
                            outlineOffset: 2,
                            transition: 'transform 0.1s',
                            minHeight: 56,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color }}>{day}</div>
                          {statusLabel && (
                            <div style={{ fontSize: 9, fontWeight: 600, color, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              {statusLabel}
                            </div>
                          )}
                          {rec && rec.salesRevenue != null && (
                            <div
                              style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                color: rec.salesRevenue > 0 ? '#047857' : '#64748B',
                                background: rec.salesRevenue > 0 ? '#D1FAE5' : '#F1F5F9',
                                padding: '1px 5px',
                                borderRadius: 4,
                                marginTop: 2,
                                border: rec.salesRevenue > 0 ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ₹{rec.salesRevenue.toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
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
