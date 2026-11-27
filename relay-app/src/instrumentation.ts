// Runs once when the Relay server starts (Next.js instrumentation hook).
// Starts automatic SMS outreach in the Node.js runtime; see src/server/sms/autorun.ts.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startOutreachAutorun } = await import('./server/sms/autorun');
    startOutreachAutorun();
  }
}
