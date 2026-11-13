// Quiet hours, cadence and caps (AGENT_SAFETY_RULES R7). Clinic zone: America/Los_Angeles.
import { describe, expect, it } from 'vitest';
import {
  ageOn, cadenceVerdict, DEFAULT_OUTREACH_SETTINGS as S, isWithinSendWindow, nextSendWindow,
} from '@/server/sms/schedule';

const TZ = 'America/Los_Angeles';
const at = (iso: string) => new Date(iso);
const H = 3600_000;

describe('quiet hours (R7.1)', () => {
  it('allows 8:00 am–7:59 pm Mon–Sat local', () => {
    expect(isWithinSendWindow(at('2026-11-13T08:00:00-08:00'), S, TZ)).toBe(true);  // Fri 8:00
    expect(isWithinSendWindow(at('2026-11-13T19:59:00-08:00'), S, TZ)).toBe(true);  // Fri 7:59 pm
    expect(isWithinSendWindow(at('2026-11-14T12:00:00-08:00'), S, TZ)).toBe(true);  // Sat noon
  });
  it('blocks nights, Sundays and holidays', () => {
    expect(isWithinSendWindow(at('2026-11-13T07:59:00-08:00'), S, TZ)).toBe(false);
    expect(isWithinSendWindow(at('2026-11-13T20:00:00-08:00'), S, TZ)).toBe(false);
    expect(isWithinSendWindow(at('2026-11-15T12:00:00-08:00'), S, TZ)).toBe(false); // Sunday
    expect(isWithinSendWindow(at('2026-11-26T12:00:00-08:00'), { ...S, holidays: ['2026-11-26'] }, TZ)).toBe(false);
  });
  it('next window: Tue 10:40 pm → Wed 8:00 am; Sat 9 pm → Mon 8:00 am', () => {
    expect(nextSendWindow(at('2026-11-17T22:40:00-08:00'), S, TZ).toISOString()).toBe(at('2026-11-18T08:00:00-08:00').toISOString());
    expect(nextSendWindow(at('2026-11-14T21:00:00-08:00'), S, TZ).toISOString()).toBe(at('2026-11-16T08:00:00-08:00').toISOString());
  });
  it('handles the DST change (Mar 8 2026 is a Sunday; Monday is PDT)', () => {
    expect(nextSendWindow(at('2026-03-07T21:00:00-08:00'), S, TZ).toISOString()).toBe(at('2026-03-09T08:00:00-07:00').toISOString());
  });
});

describe('cadence 0/2/5/9, spacing, caps (R7.3)', () => {
  const start = at('2026-11-02T09:00:00-08:00'); // Monday
  const base = { cycleStep: 0, cycleStartedAt: null, lastOutreachAt: null, outreachCount: 0, repliedSinceOutreach: false };

  it('first outreach is due immediately', () => {
    expect(cadenceVerdict(base, start, S, TZ)).toEqual({ action: 'send', step: 0 });
  });
  it('follow-ups wait for their day and 48h spacing', () => {
    const afterFirst = { ...base, cycleStep: 1, cycleStartedAt: start, lastOutreachAt: start, outreachCount: 1 };
    expect(cadenceVerdict(afterFirst, new Date(start.getTime() + 47 * H), S, TZ).action).toBe('wait');
    expect(cadenceVerdict(afterFirst, new Date(start.getTime() + 48 * H), S, TZ)).toEqual({ action: 'send', step: 1 });
    const afterSecond = { ...afterFirst, cycleStep: 2, lastOutreachAt: new Date(start.getTime() + 48 * H), outreachCount: 2 };
    expect(cadenceVerdict(afterSecond, new Date(start.getTime() + 4 * 24 * H), S, TZ).action).toBe('wait');
    expect(cadenceVerdict(afterSecond, new Date(start.getTime() + 5 * 24 * H), S, TZ)).toEqual({ action: 'send', step: 2 });
    const afterThird = { ...afterSecond, cycleStep: 3, lastOutreachAt: new Date(start.getTime() + 5 * 24 * H), outreachCount: 3 };
    expect(cadenceVerdict(afterThird, new Date(start.getTime() + 9 * 24 * H), S, TZ)).toEqual({ action: 'send', step: 3 });
  });
  it('never more than one unsolicited text per local day', () => {
    const s = { ...S, minSpacingHours: 1, cadenceDays: [0, 0.01] };
    const c = { ...base, cycleStep: 1, cycleStartedAt: start, lastOutreachAt: start, outreachCount: 1 };
    expect(cadenceVerdict(c, new Date(start.getTime() + 2 * H), s, TZ)).toEqual({ action: 'wait', reason: 'already texted today' });
  });
  it('no 5th text; cadence_exhausted 72h after the final attempt', () => {
    const final = new Date(start.getTime() + 9 * 24 * H);
    const done = { ...base, cycleStep: 4, cycleStartedAt: start, lastOutreachAt: final, outreachCount: 4 };
    expect(cadenceVerdict(done, new Date(final.getTime() + 71 * H), S, TZ).action).toBe('wait');
    expect(cadenceVerdict(done, new Date(final.getTime() + 72 * H), S, TZ)).toEqual({ action: 'exhausted' });
  });
  it('lifetime cap of 6 stops everything', () => {
    expect(cadenceVerdict({ ...base, outreachCount: 6 }, start, S, TZ)).toEqual({ action: 'wait', reason: 'lifetime cap reached' });
  });
  it('any patient reply stops the follow-up timer', () => {
    expect(cadenceVerdict({ ...base, cycleStep: 1, cycleStartedAt: start, repliedSinceOutreach: true }, new Date(start.getTime() + 100 * H), S, TZ).action).toBe('wait');
  });
});

describe('minors (R7.4)', () => {
  it('computes age in the clinic zone', () => {
    expect(ageOn('2010-11-14', at('2026-11-13T12:00:00-08:00'), TZ)).toBe(15);
    expect(ageOn('2008-11-13', at('2026-11-13T12:00:00-08:00'), TZ)).toBe(18);
  });
});
