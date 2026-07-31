// apps/web/src/app/(protected)/layout.tsx
'use client';

import HeaderNavbar from '../../components/HeaderNavbar';
import MobileBottomNav from '../../components/MobileBottomNav';
import AuthGuard from '../../components/AuthGuard';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="fullpage-layout">
        <HeaderNavbar />
        <main className="fullpage-content">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </AuthGuard>
  );
}
