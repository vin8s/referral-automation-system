// Text for the sign-in screen, English + Spanish. Pure data + one resolver so the
// state logic is unit-tested (test/auth.test.ts).

import type { LoginError } from '@/server/auth/errors';
import { isLoginError } from '@/server/auth/errors';

export type Lang = 'en' | 'es';
export type NoticeTone = 'info' | 'warn';

interface Copy {
  title: string;
  subtitle: string;
  signIn: string;
  tryAgain: string;
  staffOnly: string;
  firstTimeTitle: string;
  firstTimeSteps: string[];
  forgot: string;
  help: string;
  switchLang: string;
  mockBadge: string;
  mockHint: string;
  mockFooter: string;
  signedOut: string;
  expiredIdle: string;
  expiredAbsolute: string;
  errors: Record<LoginError, string>;
}

export const COPY: Record<Lang, Copy> = {
  en: {
    title: 'Sign in to Relay',
    subtitle: 'Referral scheduling console',
    signIn: 'Sign in',
    tryAgain: 'Try again',
    staffOnly: 'Clinic staff only. Sign-in uses your clinic account and an authenticator app, and activity is recorded in the audit log.',
    firstTimeTitle: 'First time signing in?',
    firstTimeSteps: [
      'Use the email address and temporary password from your invitation email.',
      'Choose your own new password.',
      'Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, or similar) and enter the 6-digit code.',
    ],
    forgot: 'Forgot your password? Choose “Sign in”, then “Forgot password”. A reset code is emailed to you.',
    help: 'Lost your phone or locked out? Ask the clinic administrator.',
    switchLang: 'Español',
    mockBadge: 'Development',
    mockHint: 'Mock login · pick a fake user',
    mockFooter: 'Mock login is disabled automatically in production builds.',
    signedOut: 'You have been signed out.',
    expiredIdle: 'You were signed out after a period of inactivity. Please sign in again.',
    expiredAbsolute: 'Your sign-in reached its time limit (one shift). Please sign in again.',
    errors: {
      config: 'Sign-in is not set up correctly on this server. Please tell the clinic administrator.',
      attempt_expired: 'That sign-in attempt expired or was opened in another tab. Please try again.',
      cancelled: 'Sign-in was cancelled.',
      no_role: 'Your account works, but it hasn’t been given access to Relay yet. Ask the clinic administrator to add you to the “ma” or “admin” group, then sign in again.',
      signin_failed: 'Sign-in didn’t complete. Please try again.',
      unknown_user: 'Unknown test user.',
    },
  },
  es: {
    title: 'Iniciar sesión en Relay',
    subtitle: 'Consola de citas de referidos',
    signIn: 'Iniciar sesión',
    tryAgain: 'Intentar de nuevo',
    staffOnly: 'Solo para personal de la clínica. El acceso usa su cuenta de la clínica y una aplicación autenticadora; la actividad queda registrada.',
    firstTimeTitle: '¿Es su primera vez?',
    firstTimeSteps: [
      'Use su correo electrónico y la contraseña temporal del correo de invitación.',
      'Elija su nueva contraseña.',
      'Escanee el código QR con una aplicación autenticadora (Google Authenticator, Microsoft Authenticator u otra) e ingrese el código de 6 dígitos.',
    ],
    forgot: '¿Olvidó su contraseña? Elija “Iniciar sesión” y luego la opción para restablecer la contraseña. Le enviaremos un código por correo.',
    help: '¿Perdió su teléfono o no puede entrar? Pida ayuda al administrador de la clínica.',
    switchLang: 'English',
    mockBadge: 'Desarrollo',
    mockHint: 'Acceso simulado · elija un usuario de prueba',
    mockFooter: 'El acceso simulado se desactiva automáticamente en producción.',
    signedOut: 'Ha cerrado sesión.',
    expiredIdle: 'Se cerró su sesión por inactividad. Inicie sesión de nuevo.',
    expiredAbsolute: 'Su sesión llegó a su límite de tiempo (un turno). Inicie sesión de nuevo.',
    errors: {
      config: 'El inicio de sesión no está bien configurado en este servidor. Avise al administrador de la clínica.',
      attempt_expired: 'Ese intento de inicio de sesión expiró o se abrió en otra pestaña. Inténtelo de nuevo.',
      cancelled: 'Se canceló el inicio de sesión.',
      no_role: 'Su cuenta funciona, pero todavía no tiene acceso a Relay. Pida al administrador de la clínica que lo agregue al grupo “ma” o “admin” y vuelva a iniciar sesión.',
      signin_failed: 'No se completó el inicio de sesión. Inténtelo de nuevo.',
      unknown_user: 'Usuario de prueba desconocido.',
    },
  },
};

export interface LoginSearch { error?: string; signed_out?: string; reason?: string; lang?: string }

export function pickLang(v: unknown): Lang {
  return v === 'es' ? 'es' : 'en';
}

/**
 * The one notice to show on the sign-in screen. A server misconfiguration wins over
 * everything; then an error from the last attempt; then expiry; then "signed out".
 */
export function resolveNotice(
  sp: LoginSearch, lang: Lang, misconfigured: boolean,
): { tone: NoticeTone; text: string; error?: LoginError } | null {
  const c = COPY[lang];
  if (misconfigured) return { tone: 'warn', text: c.errors.config, error: 'config' };
  if (sp.error) {
    const error: LoginError = isLoginError(sp.error) ? sp.error : 'signin_failed';
    return { tone: error === 'cancelled' ? 'info' : 'warn', text: c.errors[error], error };
  }
  if (sp.reason === 'idle') return { tone: 'warn', text: c.expiredIdle };
  if (sp.reason === 'absolute') return { tone: 'warn', text: c.expiredAbsolute };
  if (sp.signed_out) return { tone: 'info', text: c.signedOut };
  return null;
}
