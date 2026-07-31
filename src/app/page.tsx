// apps/web/src/app/page.tsx
import { redirect } from 'next/navigation';

// Root "/" → redirect to /login (login page handles authenticated redirect)
export default function RootPage() {
  redirect('/login');
}
