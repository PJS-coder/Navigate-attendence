// apps/web/src/components/AuthGuard.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps protected pages. Redirects to /login if not authenticated.
 * Also supports adminOnly guard.
 */
export default function AuthGuard({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (adminOnly && user?.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, adminOnly, user, router]);

  if (!isAuthenticated) return null;
  if (adminOnly && user?.role !== 'ADMIN') return null;

  return <>{children}</>;
}
