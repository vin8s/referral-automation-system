// Automatic outreach: when it is on, and that overlapping runs never double-text.
import { describe, expect, it } from 'vitest';
import { outreachAutorunEnabled, outreachAutorunSeconds } from '@/server/sms/autorun';
import { runOutreachTick } from '@/server/sms/outreach';
import { addReferral, harness, outbound, testDb } from './sms-harness';

describe('outreach autorun settings', () => {
  it('is on in development, off in production and tests unless forced', () => {
    expect(outreachAutorunEnabled({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(outreachAutorunEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(outreachAutorunEnabled({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(false);
    expect(outreachAutorunEnabled({ NODE_ENV: 'production', OUTREACH_AUTORUN: 'on' } as NodeJS.ProcessEnv)).toBe(true);
    expect(outreachAutorunEnabled({ NODE_ENV: 'development', OUTREACH_AUTORUN: 'off' } as NodeJS.ProcessEnv)).toBe(false);
  });
  it('uses 300 seconds by default and never less than 30', () => {
    expect(outreachAutorunSeconds({} as NodeJS.ProcessEnv)).toBe(300);
    expect(outreachAutorunSeconds({ NODE_ENV: 'test', OUTREACH_AUTORUN_SECONDS: '60' } as NodeJS.ProcessEnv)).toBe(60);
    expect(outreachAutorunSeconds({ NODE_ENV: 'test', OUTREACH_AUTORUN_SECONDS: '5' } as NodeJS.ProcessEnv)).toBe(300);
  });
});

describe('repeated outreach runs', () => {
  it('a second run right after the first sends nothing new', async () => {
    const db = await testDb();
    const ref = await addReferral(db);
    const h = harness(db);
    expect((await runOutreachTick(h.deps)).sent).toBe(1);
    expect((await runOutreachTick(h.deps)).sent).toBe(0);
    expect((await outbound(db, ref)).filter(m => m.template_key === 'first_outreach')).toHaveLength(1);
  });
});
