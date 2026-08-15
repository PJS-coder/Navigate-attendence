// apps/web/src/app/login/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, extractError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const { user, login, isAuthenticated } = useAuth();
  const { success, error: toastError, ToastContainer } = useToast();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(user?.role === 'ADMIN' ? '/admin' : '/dashboard');
    }
  }, [isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toastError('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      login(res.data.token, res.data.user);
      success(`Welcome back, ${res.data.user.name}! 👋`);
      const targetRoute = res.data.user.role === 'ADMIN' ? '/admin' : '/dashboard';
      setTimeout(() => router.replace(targetRoute), 400);
    } catch (err) {
      toastError(extractError(err));
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="catrider-login-page">
      <ToastContainer />

      {/* ── Organic Royal Blue Corner Blob Shapes (Matching Reference Design) ── */}
      <div className="blob-shape top-right" />
      <div className="blob-shape mid-left" />
      <div className="blob-shape bottom-right" />

      {/* Main Login Center Layout */}
      <div className="catrider-card-wrapper">
        
        {/* Top Overlapping Circular Emblem / Logo with Black Background */}
        <div className="catrider-mascot-circle">
          <div className="inner-icon-ring black-bg">
            <Image src="/navigate.png" alt="Navigate Skill Logo" width={64} height={64} className="mascot-img" />
          </div>
        </div>

        {/* Main Floating White Card */}
        <div className="catrider-white-card">
          <h2 className="catrider-login-title">LOGIN</h2>

          <form onSubmit={handleSubmit} id="catrider-login-form">
            <div className="catrider-input-group">
              <input
                className="catrider-input"
                type="email"
                placeholder="Email ID"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="catrider-input-group" style={{ position: 'relative' }}>
              <input
                className="catrider-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="pw-toggle-btn"
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </form>

        </div>

        {/* Bottom Overlapping Pill Button */}
        <button
          form="catrider-login-form"
          className="catrider-get-started-btn"
          type="submit"
          disabled={loading}
        >
          {loading ? <span className="spinner white" /> : 'Get Started'}
        </button>

      </div>
    </div>
  );
}
