// Sign-in landing screen. Production: "Sign in" → Amazon Cognito managed login
// (password, first-time password change, authenticator-app setup, MFA code and
// "Forgot password" all happen on Cognito's branded pages). This page only explains
// and shows the state the person is in: signed out, session expired, no access,
// configuration problem. Development (AUTH_MODE=mock): pick a fake staff user.

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Icon } from '@/components/shared/Icon';
import { authMode, clinicLoginName, type AuthMode } from '@/server/auth/config';
import { getSessionUser } from '@/server/auth/guard';
import { safeNext, DEFAULT_AFTER_LOGIN } from '@/server/auth/redirect';
import { MOCK_USERS, ROLE_LABEL } from '@/lib/auth-types';
import { COPY, pickLang, resolveNotice, type LoginSearch, type NoticeTone } from './messages';

export const metadata: Metadata = { title: 'Sign in — Relay', robots: { index: false, follow: false } };

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<LoginSearch & { next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const lang = pickLang(sp.lang);
  const c = COPY[lang];

  let mode: AuthMode | 'misconfigured';
  try { mode = authMode(); } catch { mode = 'misconfigured'; }

  // Already signed in (and not arriving with an error to show): go straight in.
  if (mode !== 'misconfigured' && !sp.error && (await getSessionUser().catch(() => null))) redirect(next);

  const notice = resolveNotice(sp, lang, mode === 'misconfigured');

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (next !== DEFAULT_AFTER_LOGIN) p.set('next', next);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const signInHref = `/api/auth/login${qs(lang === 'es' ? { lang: 'es' } : {})}`;
  const otherLangHref = `/login${qs(lang === 'es' ? {} : { lang: 'es' })}`;

  return (
    <main lang={lang} style={{ flex: 1, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <a href={otherLangHref} className="chip" hrefLang={lang === 'es' ? 'en' : 'es'} style={{ textDecoration: 'none' }}>
            <Icon name="map" size={12} /> {c.switchLang}
          </a>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div className="sb-mark" aria-hidden="true" style={{ width: 40, height: 40, fontSize: 19, borderRadius: 11 }}>R</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--relay-ink)', letterSpacing: '-0.01em' }}>Relay</div>
              <div style={{ fontSize: 12.5, color: 'var(--relay-accent-700)', fontWeight: 500 }}>{clinicLoginName()}</div>
            </div>
            {/* The pilot clinic's own logo (public/brand/rifc-logo.png, from rifreeclinic.org). */}
            <Image
              src="/brand/rifc-logo.png" alt={clinicLoginName()} width={64} height={64} unoptimized
              style={{ flex: '0 0 auto', borderLeft: '1px solid var(--relay-hairline)', paddingLeft: 10, boxSizing: 'content-box' }}
            />
          </div>

          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: 'var(--relay-ink)' }}>{c.title}</h1>
          <p style={{ fontSize: 13, color: 'var(--relay-ink-3)', margin: '0 0 18px' }}>{c.subtitle}</p>

          {notice && <Notice tone={notice.tone} text={notice.text} />}

          {(mode === 'cognito' || mode === 'misconfigured') && (
            <>
              {mode === 'cognito' ? (
                <a
                  href={signInHref}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 14px', fontSize: 14, textDecoration: 'none' }}
                >
                  <Icon name="shield" size={15} />
                  {notice?.error && notice.error !== 'config' ? c.tryAgain : c.signIn}
                </a>
              ) : (
                <button type="button" className="btn btn-primary" disabled aria-disabled="true"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 14px', fontSize: 14, opacity: 0.5, cursor: 'not-allowed' }}>
                  <Icon name="shield" size={15} /> {c.signIn}
                </button>
              )}
              <p style={{ fontSize: 12, color: 'var(--relay-ink-3)', lineHeight: 1.5, margin: '14px 0 0' }}>{c.staffOnly}</p>

              <details style={{ marginTop: 16, borderTop: '1px solid var(--relay-hairline)', paddingTop: 14 }}>
                <summary style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--relay-ink-2)', cursor: 'pointer' }}>
                  {c.firstTimeTitle}
                </summary>
                <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--relay-ink-2)', lineHeight: 1.55 }}>
                  {c.firstTimeSteps.map(step => <li key={step} style={{ marginBottom: 4 }}>{step}</li>)}
                </ol>
              </details>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--relay-ink-3)', lineHeight: 1.5 }}>
                <span style={{ display: 'flex', gap: 6 }}><Icon name="info" size={13} /> {c.forgot}</span>
                <span style={{ display: 'flex', gap: 6 }}><Icon name="user" size={13} /> {c.help}</span>
              </div>
            </>
          )}

          {mode === 'mock' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                  background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)',
                }}>
                  {c.mockBadge}
                </span>
                <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>{c.mockHint}</span>
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
              <p style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', margin: '14px 0 0' }}>{c.mockFooter}</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Notice({ tone, text }: { tone: NoticeTone; text: string }) {
  // Two-tier palette: teal = informational, amber = "needs your attention".
  // (Red is reserved for the Escalated referral state and is never used here.)
  const [bg, fg, border, icon] = tone === 'info'
    ? ['var(--relay-accent-50)', 'var(--relay-accent-800)', 'var(--relay-accent-200)', 'check' as const]
    : ['var(--relay-urgent-50)', 'var(--relay-urgent-700)', 'var(--relay-urgent-200)', 'alert' as const];
  return (
    <div role={tone === 'warn' ? 'alert' : 'status'} style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: 1.45,
      background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 8, padding: '9px 11px', marginBottom: 16,
    }}>
      <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name={icon} size={13} /></span>
      <span>{text}</span>
    </div>
  );
}
