// apps/web/src/components/HeaderNavbar.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function HeaderNavbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router   = useRouter();

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const handleLogout = () => { logout(); router.push('/login'); };
  // Do not render top header navbar on Admin portal (admin has dedicated executive sidebar & header bar)
  if (user?.role === 'ADMIN' || pathname.startsWith('/admin')) {
    return null;
  }

  // Navigation items for Employees only
  const employeeNav = [
    {
      href: '/dashboard',
      label: 'Clock In/Out',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      href: '/timesheet',
      label: 'Timesheet',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    {
      href: '/salary',
      label: 'Salary',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
    },
  ];

  return (
    <header className="top-header-navbar">
      <div className="top-navbar-container">
        
        {/* Left: Brand Logo & Title */}
        <Link href="/dashboard" className="brand-logo-group">
          <div className="brand-logo-circle-black">
            <Image
              src="/navigate.png"
              alt="Navigate Skill"
              width={26}
              height={26}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <span className="brand-title">Navigate Skill</span>
        </Link>

        {/* Center: Desktop Nav Links for Employees */}
        <nav className="top-navbar-nav">
          {employeeNav.map(n => (
            <Link
              key={n.href}
              href={n.href}
              className={`top-nav-link${pathname === n.href ? ' active' : ''}`}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>

        {/* Right: User Profile & Logout */}
        <div className="top-navbar-user">
          <div className="user-profile-badge">
            <div className="user-avatar">{initials}</div>
            <div className="user-info-text">
              <span className="u-name">{user?.name ?? 'User'}</span>
              <span className="u-role">{user?.role?.toLowerCase()}</span>
            </div>
          </div>
          <button className="btn-logout-icon" onClick={handleLogout} title="Sign out">⎋</button>
        </div>

      </div>
    </header>
  );
}
