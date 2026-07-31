// apps/web/src/app/(protected)/timesheet/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, extractError } from '../../../services/api';
import { useToast } from '../../../hooks/useToast';
import { AttendanceRecord, AttendanceStatus } from '../../../types';
import { format, parseISO } from 'date-fns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: 'badge badge-present',
  LATE: 'badge badge-late',
  ABSENT: 'badge badge-absent',
  HALF_DAY: 'badge badge-half',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  HALF_DAY: 'Half Day',
};

const fmtTime = (iso: string | null) =>
  iso ? format(parseISO(iso), 'HH:mm') : '—';

export default function TimesheetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: toastError, ToastContainer } = useToast();

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/timesheet', { params: { year, month } });
      setRecords(res.data.data);
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [year, month, toastError]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Map records by ISO date string (YYYY-MM-DD)
  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach(r => {
      const dateStr = typeof r.date === 'string' ? r.date.split('T')[0] : '';
      if (dateStr) map.set(dateStr, r);
    });
    return map;
  }, [records]);

  // Calendar Calculation
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    
    const days: ({ day: number; dateStr: string; record?: AttendanceRecord } | null)[] = [];
    
    // Empty padding for start offset
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    // Days 1..daysInMonth
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        dateStr: dStr,
        record: recordMap.get(dStr),
      });
    }

    return days;
  }, [year, month, recordMap]);

  // Count totals for current month
  const presentCount  = records.filter(r => r.status === 'PRESENT').length;
  const lateCount     = records.filter(r => r.status === 'LATE').length;
  const absentCount   = records.filter(r => r.status === 'ABSENT').length;
  const halfDayCount  = records.filter(r => r.status === 'HALF_DAY').length;

  return (
    <div className="page">
      <ToastContainer />

      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Calendar</h1>
          <p className="page-subtitle">View and track your monthly attendance logs</p>
        </div>

        {/* Month Selector */}
        <div className="month-picker-pill">
          <button className="month-btn" onClick={prevMonth}>‹</button>
          <span className="month-label">{MONTHS[month - 1]} {year}</span>
          <button className="month-btn" onClick={nextMonth}>›</button>
        </div>
      </div>

      {/* Top Legend Bar with Total Counts */}
      <div className="calendar-legend-bar">
        <div className="legend-item legend-present">
          <span className="legend-icon">✅</span>
          <span className="legend-text">Present: <strong>{presentCount}</strong></span>
        </div>
        <div className="legend-item legend-late">
          <span className="legend-icon">⏰</span>
          <span className="legend-text">Late: <strong>{lateCount}</strong></span>
        </div>
        <div className="legend-item legend-absent">
          <span className="legend-icon">❌</span>
          <span className="legend-text">Absent: <strong>{absentCount}</strong></span>
        </div>
        <div className="legend-item legend-halfday">
          <span className="legend-icon">🌓</span>
          <span className="legend-text">Half Day: <strong>{halfDayCount}</strong></span>
        </div>
      </div>

      {/* Monthly Calendar Grid */}
      <div className="calendar-card">
        {/* Days of week header */}
        <div className="calendar-week-header">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="calendar-week-cell">{day}</div>
          ))}
        </div>

        {/* Calendar Days Grid */}
        <div className="calendar-days-grid">
          {calendarDays.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} className="calendar-day-cell empty" />;
            }

            const rec = cell.record;
            const isToday =
              cell.day === now.getDate() &&
              month === now.getMonth() + 1 &&
              year === now.getFullYear();

            return (
              <div
                key={cell.dateStr}
                className={`calendar-day-cell${isToday ? ' today' : ''}${rec ? ` status-${rec.status.toLowerCase()}` : ''}`}
              >
                <div className="day-number">{cell.day}</div>
                {rec && (
                  <div className="day-status-box">
                    <span className={`status-pill ${rec.status.toLowerCase()}`}>
                      {rec.status === 'PRESENT' && '✅ Present'}
                      {rec.status === 'LATE' && '⏰ Late'}
                      {rec.status === 'ABSENT' && '❌ Absent'}
                      {rec.status === 'HALF_DAY' && '🌓 Half Day'}
                    </span>
                    <div className="day-time">
                      {fmtTime(rec.clockIn)} - {fmtTime(rec.clockOut)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Attendance Log Table */}
      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>
          Monthly Records ({records.length})
        </h2>

        {records.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
            No attendance records found for {MONTHS[month - 1]} {year}.
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th>Late</th>
                  <th>WiFi</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.date}</td>
                    <td>{fmtTime(r.clockIn)}</td>
                    <td>{fmtTime(r.clockOut)}</td>
                    <td style={{ fontWeight: 800 }}>{r.totalHours != null ? `${r.totalHours}h` : '—'}</td>
                    <td><span className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span></td>
                    <td style={{ color: r.isLate ? '#D97706' : 'var(--text-muted)' }}>
                      {r.isLate ? `+${r.lateMinutes}m` : '—'}
                    </td>
                    <td>{r.wifiVerified ? '📶 Verified' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
