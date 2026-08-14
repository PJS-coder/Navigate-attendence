// apps/web/src/components/SplashScreen.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    // Hide splash after 400ms for instant, fast load
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setMounted(false), 300); // Unmount after fade-out transition
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  return (
    <div className={`splash-overlay ${visible ? 'fade-in' : 'fade-out'}`}>
      {/* Top Right Curved Background Shape */}
      <div className="splash-shape-top-right" />

      {/* Bottom Left Curved Background Shape */}
      <div className="splash-shape-bottom-left" />

      {/* Center Content */}
      <div className="splash-center-box">
        {/* Circle Black Logo with Ring Loader at Perimeter */}
        <div className="splash-logo-wrapper">
          <div className="splash-spinner-ring" />
          <div className="splash-black-circle">
            <Image
              src="/navigate.png"
              alt="Navigate Skill Logo"
              width={52}
              height={52}
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
        </div>

        <h1 className="splash-title">Navigate Skill</h1>
        <p className="splash-subtitle">Attendance & Workforce Portal</p>
      </div>
    </div>
  );
}
