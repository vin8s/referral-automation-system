// Login screen. Production: "Sign in with clinic account" → Amazon Cognito hosted UI.
// Development (AUTH_MODE=mock): pick a fake staff user.

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Icon } from '@/components/shared/Icon';
import { authMode, type AuthMode } from '@/server/auth/config';
import { getSessionUser } from '@/server/auth/guard';
import { safeNext } from '@/server/auth/pending';
import { MOCK_USERS, ROLE_LABEL } from '@/lib/auth-types';

export const metadata: Metadata = { title: 'Sign in — Relay' };

const ERRORS: Record<string, string> = {
  config: 'Sign-in is not configured on this server. Ask your administrator to check the Cognito settings.',
  expired: 'Your sign-in attempt timed out. Please try again.',
  no_role: 'Your account is not assigned to a Relay role (ma or admin). Ask an administrator to add you.',
  signin_failed: 'Sign-in failed. Please try again.',
  unknown_user: 'Unknown test user.',
};

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ next?: string; error?: string; signed_out?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  let mode: AuthMode | 'misconfigured';
  try { mode = authMode(); } catch { mode = 'misconfigured'; }

  if (mode !== 'misconfigured' && (await getSessionUser().catch(() => null))) redirect(next);

  const error = mode === 'misconfigured' ? ERRORS.config : sp.error ? (ERRORS[sp.error] ?? ERRORS.signin_failed) : null;

  return (
    <main style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="sb-brand" style={{ borderBottom: 0, justifyContent: 'center', marginBottom: 6 }}>
          <div className="sb-mark">R</div>
          <div>
            <div className="sb-name">Relay</div>
            <div className="sb-sub">Referral conversion console</div>
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Sign in</h3>
          <p className="card-sub" style={{ marginBottom: 18 }}>
            Staff access only. Activity is recorded in the audit log.
          </p>

          {sp.signed_out && !error && (
            <div style={noteStyle('var(--relay-accent-50)', 'var(--relay-accent-800)', 'var(--relay-accent-200)')}>
              <Icon name="check" size={13} /> You have been signed out.
            </div>
          )}
          {error && (
            <div role="alert" style={noteStyle('var(--relay-urgent-50)', 'var(--relay-urgent-700)', 'var(--relay-urgent-200)')}>
              <Icon name="alert" size={13} /> {error}
            </div>
          )}

          {mode === 'cognito' && (
            <a
              href={`/api/auth/login?next=${encodeURIComponent(next)}`}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '9px 12px', textDecoration: 'none' }}
            >
              <Icon name="shield" size={14} /> Sign in with clinic account
            </a>
          )}

          {mode === 'mock' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                  background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)',
                }}>
                  Development
                </span>
                <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Mock login · pick a fake user</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MOCK_USERS.map(u => (
                  <form key={u.id} action="/api/auth/mock-login" method="post">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="next" value={next} />
                    <button type="submit" className="btn" style={{ width: '100%', padding: '10px 12px', gap: 10 }}>
                      <span className="tb-avatar" style={{ width: 28, height: 28, fontSize: 11, cursor: 'inherit' }}>
                        {u.name.split(' ').map(p => p[0]).join('')}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{ROLE_LABEL[u.role]}</span>
                      </span>
                      <Icon name="arrow" size={12} />
                    </button>
                  </form>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', margin: '14px 0 0' }}>
                Mock login is disabled automatically in production builds.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function noteStyle(bg: string, fg: string, border: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: 1.45,
    background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 8,
    padding: '9px 11px', marginBottom: 14,
  };
}
