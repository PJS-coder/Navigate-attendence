// apps/web/src/app/(protected)/dashboard/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, extractError } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../hooks/useToast';
import { useLocationVerification } from '../../../hooks/useLocationVerification';
import { AttendanceRecord } from '../../../types';

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

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

  // ── GPS Geofencing + IP Whitelist verification ───────────────────────────
  const location = useLocationVerification();

  // Inline Sales & Leads Assigned state
  const [salesRevenue, setSalesRevenue] = useState<string>('');
  const [leadsAssigned, setLeadsAssigned] = useState<string>('');
  const [earlyLeaveReason, setEarlyLeaveReason] = useState<string>('');
  const [showEarlyLeaveModal, setShowEarlyLeaveModal] = useState(false);

  // Live time clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
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

  // ── Time-gate helpers (all times in local/IST) ──────────────────────────
  const nowTotalMin     = currentHour * 60 + currentMinute;
  const isShiftOpen     = nowTotalMin >= 9 * 60 + 55;   // 09:55 — shift opens
  const isHalfDayZone   = nowTotalMin >= 10 * 60 + 15;  // 10:15 — auto half-day
  const isAbsentLocked  = nowTotalMin >= 14 * 60 + 15;  // 14:15 — too late to clock-in
  const canClockOut     = currentHour >= 18;             // 18:00 — clock-out opens

  const handleClockIn = async () => {
    if (!isShiftOpen) {
      toastError('Shift opens at 09:55 AM. Please wait.');
      return;
    }
    if (isAbsentLocked) {
      toastError('Clock-in window closed at 2:15 PM. You are marked Absent for today.');
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

    setAction(true);
    try {
      const payload: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        method:    'gps',
        lat:       location.coords?.lat,
        lng:       location.coords?.lng,
      };
      const res = await api.post('/attendance/clock-in', payload);
      setRecord(res.data.attendance);
      success(res.data.message || 'Clocked In successfully!');
      if (res.data.attendance.isLate) {
        info(`⚠️ Marked Late by ${res.data.attendance.lateMinutes} minutes`);
      }
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  const handleClockOut = async () => {
    if (!canClockOut) {
      toastError('Clock-out opens at 6:00 PM. Use "Request Early Leave" for an early exit.');
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
      success(res.data.message || `Clocked Out successfully! Sales: ₹${revNum}`);
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
        reason: earlyLeaveReason || 'Early Leave request before 6:00 PM',
      });
      setRecord(res.data.attendance);
      setShowEarlyLeaveModal(false);
      success('Early Leave Request submitted to Admin Panel!');
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setAction(false);
    }
  };

  return (
    <div className="page">
      <ToastContainer />

      {/* ── Persistent Location Permission Warning ──────────────────────────
           Shown ONLY when the user has explicitly denied location access.
           Cannot be dismissed — disappears automatically when permission is granted. */}
      {location.gpsPermission === 'denied' && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'linear-gradient(90deg, #7F1D1D 0%, #991B1B 100%)',
            color: '#FEF2F2',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 4px 20px rgba(127,29,29,0.45)',
            borderBottom: '2px solid #DC2626',
          }}
        >
          {/* Warning icon */}
          <svg
            width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="#FCA5A5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, letterSpacing: 0.2 }}>
              📍 Location Access Blocked
            </div>
            <div style={{ fontSize: 12, color: '#FECACA', marginTop: 2, lineHeight: 1.5 }}>
              GPS verification requires location permission. Open your browser settings, allow location for this site, then click&nbsp;
              <strong style={{ color: '#FEF2F2' }}>Refresh</strong> below.
            </div>
          </div>

          {/* How-to steps */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            flexWrap: 'wrap', justifyContent: 'flex-end',
          }}>
            {/* Browser-specific hint */}
            <span style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              🔒 Click the lock icon in the address bar → Allow Location
            </span>

            {/* Manual refresh trigger */}
            <button
              onClick={location.refresh}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                background: '#DC2626',
                border: '1.5px solid #EF4444',
                color: '#FEF2F2',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                transition: 'background 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              title="Re-check location after enabling permission"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.8"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16"/>
              </svg>
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Main Full Page Card */}
      <div className="fullpage-clock-card" style={location.gpsPermission === 'denied' ? { marginTop: 90 } : undefined}>
        
        {/* Top Time & Date */}
        <div className="clock-time-display">{currentTime || '09:55'}</div>
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
                <span className="completed-badge-title pending-title">PENDING APPROVAL</span>
                <p style={{ fontSize: 13, color: '#92400E', fontWeight: 600, marginTop: 4 }}>
                  Early leave request submitted to Admin
                </p>
                <p style={{ fontSize: 11.5, color: '#B45309', fontWeight: 500, marginTop: 2 }}>
                  Awaiting Admin response. Unapproved requests after 6 PM will be marked Absent.
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
                    ? 'HALF DAY (APPROVED)'
                    : record?.status === 'ABSENT'
                    ? 'ABSENT'
                    : 'DAY COMPLETED'}
                </span>
                <p style={{ fontSize: 13, color: '#64748B', fontWeight: 600, marginTop: 4 }}>
                  Next shift opens tomorrow at 09:55 AM
                </p>
              </div>
            </div>
          )
        ) : (
          <>
            {/* Shift not yet open */}
            {!isShiftOpen && !isClockedIn && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span> Shift Opens at 09:55 AM
              </div>
            )}

            {/* Absent lock — after 2:15 PM */}
            {isAbsentLocked && !isClockedIn && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 18px', borderRadius: 20, fontSize: 12.5, fontWeight: 800, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🚫</span> Clock-in closed at 2:15 PM — You are marked <span style={{ marginLeft: 4, background: '#DC2626', color: '#fff', borderRadius: 6, padding: '1px 7px', fontSize: 11 }}>ABSENT</span>
              </div>
            )}

            {/* Half-day warning — 10:15 to 2:15 PM */}
            {isShiftOpen && isHalfDayZone && !isAbsentLocked && !isClockedIn && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> After 10:15 AM — clocking in now will mark Half Day
              </div>
            )}

            {/* Clock-out locked until 6 PM */}
            {isClockedIn && !canClockOut && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#B45309', padding: '8px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, margin: '16px auto -10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span> Clock-Out Opens at 6:00 PM
              </div>
            )}

            <button
              className={`center-orb-button ${isClockedIn ? 'clock-out' : ''}`}
              onClick={isClockedIn ? handleClockOut : handleClockIn}
              disabled={
                loading || actionLoading ||
                (!isShiftOpen && !isClockedIn) ||
                (isAbsentLocked && !isClockedIn) ||
                (!isClockedIn && (!location.canClockIn || location.status !== 'gps_ok')) ||
                (isClockedIn && !canClockOut)
              }
              title={
                !isShiftOpen && !isClockedIn
                  ? 'Shift opens at 09:55 AM'
                  : isAbsentLocked && !isClockedIn
                  ? 'Clock-in closed at 2:15 PM — marked Absent'
                  : !isClockedIn && (!location.canClockIn || location.status !== 'gps_ok')
                  ? location.label
                  : (isClockedIn && !canClockOut ? 'Clock-out opens at 6:00 PM. Use Request Early Leave for an early exit.' : '')
              }
            >
              {actionLoading ? (
                <span className="spinner" style={{ width: 32, height: 32 }} />
              ) : (
                <>
                  {/* Hand Touch Icon */}
                  <svg className="orb-icon" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                    <path d="M18 8a2 2 0 0 1 2 2v4a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.8-5.6-2.4l-2.7-4c-.4-.6-.4-1.4.1-1.9v0c.5-.5 1.4-.5 1.9-.1L7 11.5" />
                  </svg>
                  <span className="orb-text">{isClockedIn ? 'CLOCK OUT' : 'CLOCK IN'}</span>
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

          // Animated dot for checking state
          const dotAnim = s === 'checking' ? 'pulse 1.2s ease-in-out infinite' : 'none';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                className="location-tag"
                style={{ background: bgColor, borderColor, padding: '8px 16px', gap: 8 }}
              >
                {/* Dot indicator */}
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: dotColor,
                  boxShadow: dotShadow,
                  flexShrink: 0,
                  animation: dotAnim,
                }} />

                {/* Status label */}
                <span style={{ color: textColor, fontWeight: 800, fontSize: 12 }}>
                  {location.label}
                </span>

                {/* Refresh button */}
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

              {/* Out of range / error notice */}
              {(s === 'out_of_range' || s === 'error') && !isClockedIn && (
                <span style={{ fontSize: 10.5, color: '#991B1B', background: '#FEE2E2', padding: '3px 12px', borderRadius: 20, fontWeight: 700 }}>
                  🚫 You must be inside the office location range to clock in
                </span>
              )}

              {/* GPS distance sub-label */}
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

            {/* Early Leave Request Option positioned under Total Sales & Leads Assigned */}
            {!canClockOut && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <button
                  type="button"
                  className="early-leave-request-btn"
                  onClick={() => setShowEarlyLeaveModal(true)}
                >
                  <span>🏃‍♂️</span> Request Early Leave (Before 6 PM)
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

      {/* Early Leave Request Modal */}
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
                You are logging out before 6:00 PM. This request will be sent to the Admin Panel for <strong>Half Day</strong> approval. If not approved past 6:00 PM, it will be marked as <strong>Absent</strong>.
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

