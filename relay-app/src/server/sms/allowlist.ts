// Test-phone allowlist. When SMS_ALLOWED_NUMBERS is set (comma-separated), Relay texts ONLY those
// numbers; every other referral is skipped. Used for live phone tests so demo patients are never texted.
// Unset (the default) = no restriction.

const digits10 = (p: string) => p.replace(/\D/g, '').slice(-10);

export function allowedNumbers(env: NodeJS.ProcessEnv = process.env): Set<string> | null {
  const raw = env.SMS_ALLOWED_NUMBERS?.trim();
  if (!raw) return null;
  const set = new Set(raw.split(',').map(digits10).filter(n => n.length === 10));
  return set.size ? set : null;
}

export function isAllowedNumber(phone: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const set = allowedNumbers(env);
  if (!set) return true;
  return !!phone && set.has(digits10(phone));
}
