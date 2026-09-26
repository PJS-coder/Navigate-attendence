// apps/web/src/app/(protected)/dashboard/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, extractError } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../hooks/useToast';
import { useLocationVerification } from '../../../hooks/useLocationVerification';
import { AttendanceRecord } from '../../../types';

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

export default function DashboardPage() {
  const { user } = useAuth();
  const { success, error: toastError, info, ToastContainer } = useToast();

  const [record, setRecord]         = useState<AttendanceRecord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [actionLoading, setAction]  = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [currentHour, setCurrentHour] = useState<number>(0);
  const [currentMinute, setCurrentMinute] = useState<number>(0);

  // ── GPS Geofencing verification ───────────────────────────
  const location = useLocationVerification();

  // Inline Sales & Leads Assigned state
  const [salesRevenue, setSalesRevenue] = useState<string>('');
  const [leadsAssigned, setLeadsAssigned] = useState<string>('');
  const [earlyLeaveReason, setEarlyLeaveReason] = useState<string>('');
  const [lateClockInReason, setLateClockInReason] = useState<string>('');
  const [showEarlyLeaveModal, setShowEarlyLeaveModal] = useState(false);
  const [showLateClockInModal, setShowLateClockInModal] = useState(false);

  // Live time clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }));
      setCurrentHour(now.getHours());
      setCurrentMinute(now.getMinutes());
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; attendance: AttendanceRecord | null }>('/attendance/today');
      setRecord(res.data.attendance);
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const isClockedIn   = !!(record?.clockIn && !record.clockOut);
  const isClockedOut  = !!(record?.clockIn && record.clockOut);

  // ── Time-gate helpers (IST / Local) ──────────────────────────
  const nowTotalMin     = currentHour * 60 + currentMinute;
  const isShiftOpen     = nowTotalMin >= 9 * 60 + 55;                          // 09:55 AM — shift opens
  const isOnTimeClockIn = isShiftOpen && nowTotalMin < 10 * 60 + 30;           // 09:55 – 10:30 AM (PRESENT)
  const isHalfDayZone   = nowTotalMin >= 10 * 60 + 30 && nowTotalMin < 11 * 60; // 10:30 – 11:00 AM (HALF_DAY)
  const isAfterEleven   = nowTotalMin >= 11 * 60;                              // After 11:00 AM (Requires Approval)

  // Evening clock-out helpers
  const canClockOutRegular = nowTotalMin >= 18 * 60 + 45 && nowTotalMin <= 19 * 60 + 15; // 06:45 PM – 07:15 PM
  const isBeforeClockOut   = nowTotalMin < 18 * 60 + 45;                                 // Before 06:45 PM
  const isAfterClockOut    = nowTotalMin > 19 * 60 + 15;                                 // After 07:15 PM (Late Clock-Out Approval)

  const handleClockInClick = () => {
    if (!isShiftOpen) {
      toastError('Shift opens at 09:55 AM. You cannot clock in yet.');
      return;
    }
    if (location.status === 'checking') {
      toastError('Verifying your location, please wait…');
      return;
    }
    if (!location.canClockIn || location.status !== 'gps_ok') {
      toastError(location.label || 'You are outside office range. Clock-in is only allowed at the office.');
      return;
    }

    if (isAfterEleven) {
      // Prompt modal for reason after 11:00 AM
      setShowLateClockInModal(true);
      return;
    }

    executeClockIn();
  };

  const executeClockIn = async (reason?: string) => {
    setAction(true);
    try {
      const payload: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        method:    'gps',
        lat:       location.coords?.lat,
        lng:       location.coords?.lng,
        reason:    reason || undefined,
      };
      const res = await api.post('/attendance/clock-in', payload);
      setRecord(res.data.attendance);
      setShowLateClockInModal(false);

      if (res.data.pendingApproval) {
        info('Clock-in request submitted to Manager for approval (After 11:00 AM)!');
      } else {
        success(res.data.message || 'Clocked In successfully!');
      }
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  const handleClockOut = async () => {
    if (isBeforeClockOut) {
      toastError('Clock-out opens at 06:45 PM. Use "Request Early Leave" to submit before then.');
      return;
    }

    const revNum = parseFloat(salesRevenue);
    if (isNaN(revNum) || revNum < 0) {
      toastError('Please enter total sales generated today');
      return;
    }

    const leadsNum = parseInt(leadsAssigned, 10);
    const validLeads = isNaN(leadsNum) || leadsNum < 0 ? 0 : leadsNum;

    setAction(true);
    try {
      const res = await api.post('/attendance/clock-out', {
        timestamp: new Date().toISOString(),
        salesRevenue: revNum,
        leadsAssigned: validLeads,
      });
      setRecord(res.data.attendance);

      if (res.data.isLateClockOut) {
        info('Clock-out after 7:15 PM submitted for Manager approval!');
      } else {
        success(res.data.message || `Clocked Out successfully! Sales: ₹${revNum}`);
      }
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  const submitEarlyLeave = async () => {
    const revNum = parseFloat(salesRevenue);
    if (isNaN(revNum) || revNum < 0) {
      toastError('Please enter total sales before submitting early leave');
      return;
    }

    const leadsNum = parseInt(leadsAssigned, 10);
    const validLeads = isNaN(leadsNum) || leadsNum < 0 ? 0 : leadsNum;

    setAction(true);
    try {
      const res = await api.post('/attendance/clock-out', {
        timestamp: new Date().toISOString(),
        salesRevenue: revNum,
        leadsAssigned: validLeads,
        isEarlyLeave: true,
        reason: earlyLeaveReason || 'Early Leave request before 06:45 PM',
      });
      setRecord(res.data.attendance);
      setShowEarlyLeaveModal(false);
      success('Early Leave Request submitted to Manager Portal!');
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  return (
    <div className="page">
      <ToastContainer />

      {/* ── Centered Location Permission Modal Popup ────────────────────────── */}
      {location.gpsPermission === 'denied' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-modal-title"
          className="location-modal-backdrop"
        >
          <div className="location-modal-card">
            <div className="location-modal-icon-badge">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>

            <h3 id="location-modal-title" className="location-modal-title">
              Turn On Location Access
            </h3>

            <p className="location-modal-desc">
              GPS verification is required to clock in & out for your shift. Please turn on location access to continue.
            </p>

            <button
              onClick={location.refresh}
              className="location-modal-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Turn On Location
            </button>

            <div className="location-modal-hint">
              🔒 If blocked: Tap lock icon in address bar → Allow Location
            </div>
          </div>
        </div>
      )}

      {/* Main Full Page Card */}
      <div className="fullpage-clock-card">
        
        {/* Top Time & Date */}
        <div className="clock-time-display">{currentTime || '09:55 AM'}</div>
        <div className="clock-date-display">{currentDate || 'Wednesday, Dec 12'}</div>

        {/* Attendance Completed or Center Orb Button */}
        {isClockedOut ? (
          record?.halfDayApproval === 'PENDING' ? (
            <div className="completed-attendance-wrapper">
              <div className="completed-orb-badge pending-approval-orb">
                <div className="completed-icon-circle pending-circle-pulse">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <span className="completed-badge-title pending-title">PENDING MANAGER APPROVAL</span>
                <p style={{ fontSize: 13, color: '#92400E', fontWeight: 600, marginTop: 4 }}>
                  {record.halfDayReason || 'Request submitted to Manager'}
                </p>
                <p style={{ fontSize: 11.5, color: '#B45309', fontWeight: 500, marginTop: 2 }}>
                  Awaiting Manager review. If approved, shift will be recorded; if rejected, marked Absent.
                </p>
              </div>
            </div>
          ) : (
            <div className="completed-attendance-wrapper">
              <div className="completed-orb-badge">
                <div className="completed-icon-circle">
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span className="completed-badge-title">
                  {record?.status === 'HALF_DAY'
                    ? 'HALF DAY'
                    : record?.status === 'ABSENT'
                    ? 'ABSENT'
                    : 'DAY COMPLETED'}
                </span>
                <p style={{ fontSize: 13, color: '#64748B', fontWeight: 600, marginTop: 4 }}>
                  Shift ended. Next shift opens tomorrow at 09:55 AM
                </p>
              </div>
            </div>
          )
        ) : isClockedIn && record?.halfDayApproval === 'PENDING' ? (
          <div className="completed-attendance-wrapper" style={{ margin: '14px 0' }}>
            <div className="completed-orb-badge pending-approval-orb" style={{ padding: '16px 20px' }}>
              <span className="completed-badge-title pending-title" style={{ fontSize: 14 }}>
                ⏳ LATE CLOCK-IN PENDING MANAGER APPROVAL
              </span>
              <p style={{ fontSize: 12.5, color: '#92400E', fontWeight: 600, marginTop: 3 }}>
                Clocked in after 11:00 AM. Awaiting Manager confirmation.
              </p>
            </div>
          </div>
        ) : null}

        {!isClockedOut && (
          <>
            {/* Shift not yet open (< 9:55 AM) */}
            {!isShiftOpen && !isClockedIn && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span> Shift Opens at 09:55 AM
              </div>
            )}

            {/* On-Time Clock In Window (9:55 AM – 10:30 AM) */}
            {isShiftOpen && isOnTimeClockIn && !isClockedIn && (
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🟢</span> On-Time Clock-in Window (09:55 AM – 10:30 AM)
              </div>
            )}

            {/* Half-day warning (10:30 AM – 11:00 AM) */}
            {isShiftOpen && isHalfDayZone && !isClockedIn && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> After 10:30 AM — Clocking in now will mark Half Day
              </div>
            )}

            {/* After 11:00 AM — Approval warning */}
            {isShiftOpen && isAfterEleven && !isClockedIn && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> After 11:00 AM — Clock-in requires Manager Approval
              </div>
            )}

            {/* Clock-out timing notifications when clocked in */}
            {isClockedIn && isBeforeClockOut && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#B45309', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span> Clock-Out Opens at 06:45 PM
              </div>
            )}

            {isClockedIn && canClockOutRegular && (
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🟢</span> Clock-Out Window Active (06:45 PM – 07:15 PM)
              </div>
            )}

            {isClockedIn && isAfterClockOut && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> After 07:15 PM — Clock-out will send Approval to Manager
              </div>
            )}

            <button
              className={`center-orb-button ${isClockedIn ? 'clock-out' : ''}`}
              onClick={isClockedIn ? handleClockOut : handleClockInClick}
              disabled={
                loading || actionLoading ||
                (!isShiftOpen && !isClockedIn) ||
                (!isClockedIn && (!location.canClockIn || location.status !== 'gps_ok')) ||
                (isClockedIn && isBeforeClockOut)
              }
              title={
                !isShiftOpen && !isClockedIn
                  ? 'Shift opens at 09:55 AM'
                  : !isClockedIn && (!location.canClockIn || location.status !== 'gps_ok')
                  ? location.label
                  : (isClockedIn && isBeforeClockOut ? 'Clock-out opens at 06:45 PM. Use Request Early Leave for early exit.' : '')
              }
            >
              {actionLoading ? (
                <span className="spinner" style={{ width: 32, height: 32 }} />
              ) : (
                <>
                  <svg className="orb-icon" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                    <path d="M18 8a2 2 0 0 1 2 2v4a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.8-5.6-2.4l-2.7-4c-.4-.6-.4-1.4.1-1.9v0c.5-.5 1.4-.5 1.9-.1L7 11.5" />
                  </svg>
                  <span className="orb-text">
                    {isClockedIn
                      ? (isAfterClockOut ? 'CLOCK OUT (LATE)' : 'CLOCK OUT')
                      : (isAfterEleven ? 'REQUEST CLOCK IN' : 'CLOCK IN')}
                  </span>
                </>
              )}
            </button>
          </>
        )}

        {/* ── Location Verification Badge ─────────────────────────────── */}
        {(() => {
          const s = location.status;
          const bgColor   = s === 'gps_ok'       ? '#ECFDF5'
                          : s === 'checking'     ? '#F8FAFC'
                          : '#FEF2F2';
          const dotColor  = s === 'gps_ok'       ? '#059669'
                          : s === 'checking'     ? '#94A3B8'
                          : '#DC2626';
          const dotShadow = s === 'gps_ok'       ? '0 0 0 3px rgba(5,150,105,0.2)'
                          : s === 'checking'     ? '0 0 0 3px rgba(148,163,184,0.2)'
                          : '0 0 0 3px rgba(220,38,38,0.2)';
          const borderColor = s === 'gps_ok'     ? '#A7F3D0'
                            : s === 'checking'   ? '#E2E8F0'
                            : '#FCA5A5';
          const textColor = s === 'gps_ok'       ? '#047857'
                          : s === 'checking'     ? '#64748B'
                          : '#B91C1C';

          const dotAnim = s === 'checking' ? 'pulse 1.2s ease-in-out infinite' : 'none';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                className="location-tag"
                style={{ background: bgColor, borderColor, padding: '8px 16px', gap: 8 }}
              >
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: dotColor,
                  boxShadow: dotShadow,
                  flexShrink: 0,
                  animation: dotAnim,
                }} />

                <span style={{ color: textColor, fontWeight: 800, fontSize: 12 }}>
                  {location.label}
                </span>

                <button
                  onClick={location.refresh}
                  disabled={s === 'checking'}
                  style={{
                    marginLeft: 4,
                    padding: '3px 9px',
                    borderRadius: 20,
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    cursor: s === 'checking' ? 'not-allowed' : 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    opacity: s === 'checking' ? 0.55 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  title="Re-check location"
                >
                  <svg
                    width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.8"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation: s === 'checking' ? 'spin 0.8s linear infinite' : 'none' }}
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6" />
                    <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
                  </svg>
                  {s === 'checking' ? 'Checking…' : 'Refresh'}
                </button>
              </div>

              {(s === 'out_of_range' || s === 'error') && !isClockedIn && (
                <span style={{ fontSize: 10.5, color: '#991B1B', background: '#FEE2E2', padding: '3px 12px', borderRadius: 20, fontWeight: 700 }}>
                  🚫 You must be inside the office location range to clock in
                </span>
              )}

              {s === 'gps_ok' && location.distanceMeters !== null && (
                <span style={{ fontSize: 10, color: '#059669', letterSpacing: 0.3, fontWeight: 700 }}>
                  {location.distanceMeters}m from office · GPS verified
                </span>
              )}
            </div>
          );
        })()}

        {/* Sales & Leads Assigned Dual Input Boxes */}
        {isClockedIn && !isClockedOut && (
          <div style={{ maxWidth: 360, margin: '16px auto 14px' }}>
            <div className="dual-inputs-sales-container" style={{ display: 'flex', gap: 12 }}>
              {/* Box 1: Total Sales */}
              <div className="minimal-sales-input-wrapper" style={{ flex: 1 }}>
                <span className="minimal-currency">₹</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Total Sales"
                  className="minimal-sales-input"
                  value={salesRevenue}
                  onChange={e => setSalesRevenue(e.target.value)}
                />
              </div>

              {/* Box 2: Leads Assigned */}
              <div className="minimal-sales-input-wrapper" style={{ flex: 1 }}>
                <span className="minimal-currency">📋</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Leads Assigned"
                  className="minimal-sales-input"
                  value={leadsAssigned}
                  onChange={e => setLeadsAssigned(e.target.value)}
                />
              </div>
            </div>

            {/* Early Leave Request Option (Before 6:45 PM) */}
            {isBeforeClockOut && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <button
                  type="button"
                  className="early-leave-request-btn"
                  onClick={() => setShowEarlyLeaveModal(true)}
                >
                  <span>🏃‍♂️</span> Request Early Leave (Before 06:45 PM)
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3 Stat Cards */}
        <div className="three-stats-grid">
          <div className="stat-pill-card">
            <div className="stat-pill-icon">↙</div>
            <div className="stat-pill-time">{formatTime(record?.clockIn ?? null)}</div>
            <div className="stat-pill-label">Clock In</div>
          </div>

          <div className="stat-pill-card">
            <div className="stat-pill-icon">↗</div>
            <div className="stat-pill-time">{formatTime(record?.clockOut ?? null)}</div>
            <div className="stat-pill-label">Clock Out</div>
          </div>

          <div className="stat-pill-card">
            <div className="stat-pill-icon">💰</div>
            <div className="stat-pill-time">{record?.salesRevenue != null ? `₹${record.salesRevenue}` : '—'}</div>
            <div className="stat-pill-label">Sales Revenue</div>
          </div>
        </div>

      </div>

      {/* Late Clock-In Request Modal (After 11:00 AM) */}
      {showLateClockInModal && (
        <div className="modal-backdrop" onClick={() => setShowLateClockInModal(false)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>
                Late Clock-In Approval Request
              </h3>
              <button className="modal-close" onClick={() => setShowLateClockInModal(false)}>✕</button>
            </div>
            
            <div style={{ padding: '16px 0' }}>
              <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>
                  ⚠️ Clock-in closed at 11:00 AM. Your request will be sent to the Manager. If accepted, you will be allowed; if rejected, you will be marked Absent.
                </span>
              </div>

              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4, display: 'block' }}>
                  Reason for Late Clock-In (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., Traffic delay / Doctor visit / Client meeting"
                  value={lateClockInReason}
                  onChange={e => setLateClockInReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowLateClockInModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#4F46E5', borderColor: '#4F46E5' }}
                onClick={() => executeClockIn(lateClockInReason)}
                disabled={actionLoading}
              >
                {actionLoading ? 'Submitting...' : 'Submit to Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Early Leave Request Modal (Before 6:45 PM) */}
      {showEarlyLeaveModal && (
        <div className="modal-backdrop" onClick={() => setShowEarlyLeaveModal(false)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>
                Early Leave Request
              </h3>
              <button className="modal-close" onClick={() => setShowEarlyLeaveModal(false)}>✕</button>
            </div>
            
            <div style={{ padding: '16px 0' }}>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
                You are logging out before <strong>06:45 PM</strong>. This request will be sent to the Manager Portal for <strong>Half Day</strong> approval. If rejected, it will be marked as <strong>Absent</strong>.
              </p>

              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4, display: 'block' }}>
                  Reason for Early Leave (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., Medical appointment / Personal emergency"
                  value={earlyLeaveReason}
                  onChange={e => setEarlyLeaveReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowEarlyLeaveModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#D97706', borderColor: '#D97706' }}
                onClick={submitEarlyLeave}
                disabled={actionLoading}
              >
                {actionLoading ? 'Submitting...' : 'Submit Early Leave Request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


