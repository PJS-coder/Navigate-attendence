// apps/web/src/components/AuthGuard.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps protected pages. Strictly enforces role-based navigation:
 * - Unauthenticated users -> /login
 * - Admin users attempting employee routes (/dashboard, /timesheet, /salary) -> /admin
 * - Employee users attempting /admin -> /dashboard
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

    if (user?.role === 'ADMIN' && !isAdminRoute) {
      router.replace('/admin');
    } else if (user?.role !== 'ADMIN' && isAdminRoute) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, user, pathname, router]);

  if (!isAuthenticated) return null;
  const isAdminRoute = pathname.startsWith('/admin');
  if (user?.role === 'ADMIN' && !isAdminRoute) return null;
  if (user?.role !== 'ADMIN' && isAdminRoute) return null;

  return <>{children}</>;
}
