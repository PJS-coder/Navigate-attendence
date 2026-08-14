// apps/web/src/components/AuthGuard.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps protected pages. Ensures authentication and guards admin routes:
 * - Unauthenticated users -> /login
 * - Non-admin users attempting /admin -> /dashboard
 * - Admin users have access to all routes (/admin, /dashboard, /timesheet, /salary)
 */
export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    const isAdminRoute = pathname.startsWith('/admin');

    if (user?.role !== 'ADMIN' && isAdminRoute) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, user, pathname, router]);

  if (!isAuthenticated) return null;
  const isAdminRoute = pathname.startsWith('/admin');
  if (user?.role !== 'ADMIN' && isAdminRoute) return null;

  return <>{children}</>;
}
