import jwt, { SignOptions } from 'jsonwebtoken';
import { NextRequest } from 'next/server';

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'EMPLOYEE' | 'ADMIN';
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '24h') as SignOptions['expiresIn'];

export function signToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export function getAuthUser(req: NextRequest): JWTPayload | null {
  try {
    const header = req.headers.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.split(' ')[1];
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function unauthorized(msg = 'Unauthorized') {
  return Response.json({ error: msg }, { status: 401 });
}

export function forbidden(msg = 'Forbidden') {
  return Response.json({ error: msg }, { status: 403 });
}
