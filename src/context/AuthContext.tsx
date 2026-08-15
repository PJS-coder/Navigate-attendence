// apps/web/src/context/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser]   = useState<User | null>(null);

  const logout = () => {
    localStorage.removeItem('at_token');
    localStorage.removeItem('at_user');
    localStorage.removeItem('at_login_time');
    setToken(null);
    setUser(null);
  };

  // Hydrate from localStorage after mount (SSR-safe) and refresh profile
  useEffect(() => {
    const t = localStorage.getItem('at_token');
    const u = localStorage.getItem('at_user');
    const loginTime = localStorage.getItem('at_login_time');

    // 15-day automatic session expiry check
    if (loginTime) {
      const elapsed = Date.now() - parseInt(loginTime, 10);
      if (isNaN(elapsed) || elapsed > FIFTEEN_DAYS_MS) {
        logout();
        return;
      }
    }

    if (t) setToken(t);
    if (u) { try { setUser(JSON.parse(u)); } catch { /* ignore */ } }

    if (t) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then(res => {
          if (!res.ok) throw new Error('Invalid or expired session');
          return res.json();
        })
        .then(data => {
          if (data?.user) {
            setUser(data.user);
            localStorage.setItem('at_user', JSON.stringify(data.user));
          } else {
            logout();
          }
        })
        .catch(() => {
          logout();
        });
    }
  }, []);

  const login = (t: string, u: User) => {
    localStorage.setItem('at_token', t);
    localStorage.setItem('at_user', JSON.stringify(u));
    localStorage.setItem('at_login_time', Date.now().toString());
    setToken(t);
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
