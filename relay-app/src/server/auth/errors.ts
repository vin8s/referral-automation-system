// Maps what comes back from Cognito (or goes wrong around it) to the small set of
// login-page states. Pure, so it is unit-tested (test/auth.test.ts).

/** `?error=` values the /login page understands. */
export type LoginError =
  | 'config'           // sign-in isn't set up correctly on the server / app client
  | 'attempt_expired'  // the sign-in round trip took too long, or the browser lost our state cookie
  | 'cancelled'        // the person backed out of the Cognito page / denied
  | 'no_role'          // signed in to Cognito, but not in the `admin` or `ma` group
  | 'signin_failed'    // anything else
  | 'unknown_user';    // development mock login only

export const LOGIN_ERRORS: readonly LoginError[] = ['config', 'attempt_expired', 'cancelled', 'no_role', 'signin_failed', 'unknown_user'];

export function isLoginError(v: unknown): v is LoginError {
  return typeof v === 'string' && (LOGIN_ERRORS as readonly string[]).includes(v);
}

/**
 * OAuth error codes Cognito can append to the callback URL
 * (https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
 */
export function mapAuthorizeError(code: string | null | undefined): LoginError {
  switch (code) {
    case 'access_denied':
      return 'cancelled';
    case 'login_required':
    case 'interaction_required':
      return 'attempt_expired';
    case 'invalid_request':
    case 'unauthorized_client':
    case 'invalid_scope':
    case 'unsupported_response_type':
    case 'invalid_client':
      return 'config';
    default:
      return 'signin_failed';
  }
}

/** Errors thrown by openid-client while finishing the login. */
export function mapCallbackException(err: unknown): LoginError {
  const e = err as { code?: unknown; error?: unknown; message?: unknown; cause?: { message?: unknown } } | null;
  if (!e) return 'signin_failed';
  // OAuth error responses (callback ?error=… or token endpoint), e.g. a reused/expired code → invalid_grant.
  if (typeof e.error === 'string') {
    if (e.error === 'invalid_grant') return 'attempt_expired';
    return mapAuthorizeError(e.error);
  }
  // oauth4webapi checks: a state/nonce mismatch means a stale, duplicated or replayed sign-in tab.
  // openid-client wraps these in a ClientError with a generic message; the detail is on `cause`.
  const message = [e.message, e.cause?.message].filter(m => typeof m === 'string').join(' ');
  if (e.code === 'OAUTH_INVALID_RESPONSE' && /"state"/.test(message)) return 'attempt_expired';
  if (e.code === 'OAUTH_JWT_CLAIM_COMPARISON_FAILED' && /nonce/i.test(message)) return 'attempt_expired';
  return 'signin_failed';
}
