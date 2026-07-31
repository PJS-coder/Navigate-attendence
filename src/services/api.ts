// apps/web/src/services/api.ts
'use client';

import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('at_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-redirect on 401
api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error?: string }>) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('at_token');
      localStorage.removeItem('at_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const extractError = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? err.message ?? 'Unexpected error';
  }
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
};
