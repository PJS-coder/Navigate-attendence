// apps/web/src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import SplashScreen from '../components/SplashScreen';

export const metadata: Metadata = {
  title: 'Navigate Skill — Workforce Portal',
  description: 'WiFi-verified employee attendance tracking and salary management portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SplashScreen />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
