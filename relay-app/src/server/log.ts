// Server logging that never prints patient data.
// Database and HTTP errors can echo values (names, phone numbers, DOBs), so we
// log only the context, the error class and its code — never the message body,
// request payloads or query parameters.

export function logError(context: string, err: unknown): void {
  const e = err as { name?: string; code?: string | number; status?: number } | null;
  const parts = [e?.name ?? typeof err, e?.code != null ? `code=${e.code}` : '', e?.status != null ? `status=${e.status}` : '']
    .filter(Boolean)
    .join(' ');
  console.error(`[relay] ${context} failed: ${parts}`);
}
