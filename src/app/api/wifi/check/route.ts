/**
 * This route has been replaced by /api/location/verify
 * Keeping this file to avoid 404s from any cached references.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.redirect(new URL('/api/location/verify', 'http://localhost:3000'), 301);
}
