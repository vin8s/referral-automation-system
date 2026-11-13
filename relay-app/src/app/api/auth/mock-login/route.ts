// POST /api/auth/mock-login (form: userId, next) — DEVELOPMENT ONLY.
// authMode() throws when NODE_ENV=production, so this always 404s in production.

import { NextResponse } from 'next/server';
import { authMode } from '@/server/auth/config';
import { safeNext } from '@/server/auth/pending';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/server/auth/session';
import { MOCK_USERS } from '@/lib/auth-types';

export async function POST(request: Request) {
  let mode: string;
  try { mode = authMode(); } catch { mode = 'disabled'; }
  if (mode !== 'mock' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const user = MOCK_USERS.find(u => u.id === form?.get('userId'));
  if (!user) return NextResponse.redirect(new URL('/login?error=unknown_user', request.url), 303);

  const res = NextResponse.redirect(new URL(safeNext(form?.get('next')), request.url), 303);
  res.cookies.set(SESSION_COOKIE, await signSession(user), sessionCookieOptions());
  return res;
}
