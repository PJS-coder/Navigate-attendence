// apps/web/src/app/(protected)/salary/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, extractError } from '../../../services/api';
import { useToast } from '../../../hooks/useToast';
import { SalaryBreakdown } from '../../../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

export default function SalaryPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [breakdown, setBreakdown] = useState<SalaryBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const { error: toastError, ToastContainer } = useToast();

  const fetchBreakdown = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/attendance/salary/${year}/${month}`);
      setBreakdown(res.data.breakdown);
    } catch (err) {
      toastError(extractError(err));
      setBreakdown(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, toastError]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="page">
      <ToastContainer />

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Salary Statement</h1>
        </div>

        {/* Month Selector */}
        <div className="month-picker-pill">
          <button className="month-btn" onClick={prevMonth}>‹</button>
          <span className="month-label">{MONTHS[month - 1]} {year}</span>
          <button className="month-btn" onClick={nextMonth}>›</button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <span className="spinner" style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--primary-600)' }} />
          <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 14 }}>Calculating statement...</p>
        </div>
      ) : breakdown ? (
        <div className="salary-statement-container">
          
          {/* 1. Big Purple Hero Box for Amount Only */}
          <div className="salary-big-hero-box">
            <div className="hero-total-amount">{fmtCurrency(breakdown.grossSalary)}</div>
          </div>

          {/* 2. Structured Calculations Grid System: Full Day -> Half Day -> On Leave */}
          <div className="salary-calc-grid-system" style={{ marginTop: 28 }}>
            
            {/* 1st Card: Full Day */}
            <div className="calc-grid-card fullday">
              <div className="calc-card-header">
                <span className="calc-icon">☀️</span>
                <span className="calc-label">full day :</span>
              </div>
              <div className="calc-value positive">
                Rs. {Math.max(0, breakdown.fullDayPay || 0)}
              </div>
            </div>

            {/* 2nd Card: Half Day */}
            <div className="calc-grid-card halfday">
              <div className="calc-card-header">
                <span className="calc-icon">🌗</span>
                <span className="calc-label">half day :</span>
              </div>
              <div className="calc-value positive">
                Rs. {Math.max(0, breakdown.halfDayPay || 0)}
              </div>
            </div>

            {/* 3rd Card: On Leave */}
            <div className="calc-grid-card leave">
              <div className="calc-card-header">
                <span className="calc-icon">🌴</span>
                <span className="calc-label">on leave :</span>
              </div>
              <div className={`calc-value ${breakdown.onLeaveDeduction > 0 ? 'leave' : 'positive'}`}>
                {breakdown.onLeaveDeduction > 0 ? `Rs. -${Math.abs(breakdown.onLeaveDeduction)}` : 'Rs. 0'}
              </div>
            </div>

          </div>

          {/* 3. Monthly Relaxation Allowance Footer Card */}
          <div className="relaxation-allowance-bar-card" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>🎁</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#1E1B4B' }}>Monthly Relaxation Allowance</div>
                <div style={{ fontSize: 12, color: '#6366F1', fontWeight: 600 }}>4-Hour grace pool for late clock-ins</div>
              </div>
            </div>
            <div className="relaxation-pill-val">
              {breakdown.relaxationHoursRemaining ?? 4.0} / 4.0 Hrs Left
            </div>
          </div>

        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💸</div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>No Statement Found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>No salary activity recorded for {MONTHS[month - 1]} {year}.</p>
        </div>
      )}
    </div>
  );
}
