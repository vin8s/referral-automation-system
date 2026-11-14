// eCW import: header auto-mapping, date/time/name/status parsing, time zones and DST,
// and the stale-import rule. Pure functions; FAKE values only.
import { describe, expect, it } from 'vitest';
import { DEFAULT_IMPORT_OPTIONS, guessMapping, importFreshness, mappingProblems, normalizeHeader } from '@/lib/ecwImport';
import { busySlotsOnGrid } from '@/lib/slots';
import {
  apptKeyOf, fmtTime, nameMatches, normalizeRow, normMrn, parseDate, parseDuration, parseTime, splitName, statusCategory,
} from '@/server/import/normalize';
import { zonedParts, zonedTimeToUtc } from '@/server/sms/schedule';

describe('header auto-mapping', () => {
  it('maps a typical eCW appointment report', () => {
    const m = guessMapping(['Appointment Date', 'Start Time', 'Duration', 'Patient Name', 'DOB', 'Account No', 'Phone', 'Provider', 'Facility', 'Visit Type', 'Status']);
    expect(m).toEqual({
      apptDate: 'Appointment Date', apptTime: 'Start Time', duration: 'Duration', patientName: 'Patient Name', dob: 'DOB',
      mrn: 'Account No', phone: 'Phone', provider: 'Provider', facility: 'Facility', visitType: 'Visit Type', status: 'Status',
    });
    expect(mappingProblems(m)).toEqual([]);
  });

  it('handles other spellings, punctuation and separate name columns', () => {
    const m = guessMapping(['Appt Date', 'Appt Time', 'Patient Last Name', 'Patient First Name', 'Date of Birth', 'Acct #', 'Home Phone',
      'Resource', 'Location', 'Appointment Type', 'Visit Status', 'Encounter ID', 'Notes']);
    expect(m.apptDate).toBe('Appt Date');
    expect(m.apptTime).toBe('Appt Time');
    expect(m.lastName).toBe('Patient Last Name');
    expect(m.firstName).toBe('Patient First Name');
    expect(m.patientName).toBeUndefined();
    expect(m.mrn).toBe('Acct #');
    expect(m.phone).toBe('Home Phone');
    expect(m.provider).toBe('Resource');
    expect(m.facility).toBe('Location');
    expect(m.visitType).toBe('Appointment Type');
    expect(m.status).toBe('Visit Status');
    expect(m.apptId).toBe('Encounter ID');
    expect(normalizeHeader('Account No.')).toBe('account no');
    expect(normalizeHeader('PatientName')).toBe('patient name');
  });

  it('matches headers that contain an alias and never uses a header twice', () => {
    const m = guessMapping(['Appointment Date (MM/DD/YYYY)', 'Patient', 'Date', 'Status']);
    expect(m.apptDate).toBe('Date');           // exact match wins
    expect(m.patientName).toBe('Patient');
    expect(Object.values(m).filter(v => v === 'Date')).toHaveLength(1);
  });

  it('reports what must still be mapped', () => {
    expect(mappingProblems({})).toHaveLength(3);
    expect(mappingProblems({ apptDate: 'D', mrn: 'M' })).toEqual([]);
  });
});

describe('dates', () => {
  const now = new Date('2026-11-13T18:00:00Z');
  it('reads US numeric, ISO, named and Excel-serial dates', () => {
    expect(parseDate('11/17/2026')).toEqual({ date: '2026-11-17', timeMin: null });
    expect(parseDate('1/5/2027')).toEqual({ date: '2027-01-05', timeMin: null });
    expect(parseDate('11-17-26')).toEqual({ date: '2026-11-17', timeMin: null });
    expect(parseDate('2026-11-17')).toEqual({ date: '2026-11-17', timeMin: null });
    expect(parseDate('2026-11-17 14:30')).toEqual({ date: '2026-11-17', timeMin: 870 });
    expect(parseDate('2026-11-17T09:05:00')).toEqual({ date: '2026-11-17', timeMin: 545 });
    expect(parseDate('Nov 17, 2026')).toEqual({ date: '2026-11-17', timeMin: null });
    expect(parseDate('Tuesday, November 17, 2026 10:30 AM')).toEqual({ date: '2026-11-17', timeMin: 630 });
    expect(parseDate('17 Nov 2026')).toEqual({ date: '2026-11-17', timeMin: null });
    expect(parseDate('11/17/2026 2:15 PM')).toEqual({ date: '2026-11-17', timeMin: 855 });
    expect(parseDate('46343')).toEqual({ date: '2026-11-17', timeMin: null });
    expect(parseDate('46343.4375')).toEqual({ date: '2026-11-17', timeMin: 630 });
  });
  it('respects day-first order when chosen', () => {
    expect(parseDate('03/04/1980', 'DMY')?.date).toBe('1980-04-03');
    expect(parseDate('03/04/1980', 'MDY')?.date).toBe('1980-03-04');
  });
  it('pivots two-digit years: DOBs in the past, appointments in 20xx', () => {
    expect(parseDate('03/04/59', 'MDY', 'dob', now)?.date).toBe('1959-03-04');
    expect(parseDate('03/04/05', 'MDY', 'dob', now)?.date).toBe('2005-03-04');
    expect(parseDate('03/04/27', 'MDY', 'appt', now)?.date).toBe('2027-03-04');
  });
  it('rejects impossible dates', () => {
    expect(parseDate('11/31/2026')).toBeNull();
    expect(parseDate('02/29/2026')).toBeNull();
    expect(parseDate('02/29/2028')?.date).toBe('2028-02-29');
    expect(parseDate('13/01/2026')).toBeNull();
    expect(parseDate('TBD')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('times', () => {
  it('reads 12h, 24h, military and Excel fractions', () => {
    expect(parseTime('10:30 AM')).toBe(630);
    expect(parseTime('10:30am')).toBe(630);
    expect(parseTime('10:30 a.m.')).toBe(630);
    expect(parseTime('9 AM')).toBe(540);
    expect(parseTime('12:00 PM')).toBe(720);
    expect(parseTime('12:15 AM')).toBe(15);
    expect(parseTime('14:30')).toBe(870);
    expect(parseTime('14:30:00')).toBe(870);
    expect(parseTime('0930')).toBe(570);
    expect(parseTime('0.4375')).toBe(630);
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('13:00 PM')).toBeNull();
    expect(fmtTime(630)).toBe('10:30 AM');
    expect(fmtTime(0)).toBe('12:00 AM');
    expect(fmtTime(720)).toBe('12:00 PM');
  });
  it('reads durations', () => {
    expect(parseDuration('30')).toBe(30);
    expect(parseDuration('45 min')).toBe(45);
    expect(parseDuration('1:15')).toBe(75);
    expect(parseDuration('1 hr')).toBe(60);
    expect(parseDuration('')).toBeNull();
  });
});

describe('clinic time zone and DST', () => {
  const tz = 'America/Los_Angeles';
  it('stores eCW wall-clock times as the right instant on both sides of a DST change', () => {
    // Fall back: Sun Nov 1 2026 2:00 PDT → 1:00 PST.
    expect(zonedTimeToUtc(2026, 10, 30, 9, 0, tz).toISOString()).toBe('2026-10-30T16:00:00.000Z'); // PDT, UTC-7
    expect(zonedTimeToUtc(2026, 11, 2, 9, 0, tz).toISOString()).toBe('2026-11-02T17:00:00.000Z');  // PST, UTC-8
    // Spring forward: Sun Mar 8 2026.
    expect(zonedTimeToUtc(2026, 3, 6, 9, 0, tz).toISOString()).toBe('2026-03-06T17:00:00.000Z');
    expect(zonedTimeToUtc(2026, 3, 9, 9, 0, tz).toISOString()).toBe('2026-03-09T16:00:00.000Z');
  });
  it('keeps the local date even when UTC is already the next day', () => {
    const utc = zonedTimeToUtc(2026, 11, 17, 19, 30, tz); // 7:30 PM PST = 03:30 UTC next day
    expect(utc.toISOString().slice(0, 10)).toBe('2026-11-18');
    expect(zonedParts(utc, tz).date).toBe('2026-11-17');
  });
  it('works for another clinic time zone', () => {
    expect(zonedTimeToUtc(2026, 7, 1, 9, 0, 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });
});

describe('names, MRNs, status', () => {
  it('splits "Last, First" and "First Last"', () => {
    expect(splitName('OKAFOR, JAMES A')).toEqual({ first: 'james', last: 'okafor' });
    expect(splitName('James A. Okafor')).toEqual({ first: 'james', last: 'okafor' });
    expect(splitName('Okafor James', 'last_first')).toEqual({ first: 'james', last: 'okafor' });
    expect(splitName("O'Brien-Núñez, María")).toEqual({ first: 'maria', last: 'obrien nunez' });
    expect(splitName('Cher')).toBeNull();
  });
  it('matches names against the Relay record ignoring case, accents and middle names', () => {
    expect(nameMatches({ first: 'james', last: 'okafor' }, 'James Okafor')).toBe(true);
    expect(nameMatches({ first: 'maria', last: 'delgado' }, 'María L. Delgado')).toBe(true);
    expect(nameMatches({ first: 'mark', last: 'bell' }, 'Marcus Bell')).toBe(false);
    expect(nameMatches({ first: 'maria', last: 'obrien nunez' }, "Maria O'Brien-Nunez")).toBe(true);
  });
  it('normalizes MRNs', () => {
    expect(normMrn(' 00201042 ')).toBe('201042');
    expect(normMrn('ab-12 3')).toBe('AB123');
    expect(normMrn('')).toBeNull();
  });
  it('maps eCW statuses and codes', () => {
    expect(statusCategory('Scheduled')).toBe('scheduled');
    expect(statusCategory('PEN')).toBe('scheduled');
    expect(statusCategory('')).toBe('scheduled');
    expect(statusCategory('Confirmed')).toBe('scheduled');
    expect(statusCategory('ARR')).toBe('arrived');
    expect(statusCategory('CHK')).toBe('arrived');
    expect(statusCategory('Checked Out')).toBe('completed');
    expect(statusCategory('Cancelled')).toBe('cancelled');
    expect(statusCategory('Canceled by patient')).toBe('cancelled');
    expect(statusCategory('N/S')).toBe('no_show');
    expect(statusCategory('No Show')).toBe('no_show');
    expect(statusCategory('DNKA')).toBe('no_show');
    expect(statusCategory('R/S')).toBe('rescheduled');
    expect(statusCategory('Rescheduled')).toBe('rescheduled');
    expect(statusCategory('Waitlist')).toBe('unknown');
  });
});

describe('row normalization + appointment identity', () => {
  const headers = ['Date', 'Time', 'Name', 'DOB', 'MRN', 'Provider', 'Status'];
  const mapping = { apptDate: 'Date', apptTime: 'Time', patientName: 'Name', dob: 'DOB', mrn: 'MRN', provider: 'Provider', status: 'Status' };
  it('normalizes a row and builds a stable key', () => {
    const r = normalizeRow(['11/17/2026', '2:00 PM', 'Okafor, James', '03/12/1959', '201042', 'Park, Dana MD', 'Scheduled'], headers, mapping, DEFAULT_IMPORT_OPTIONS, 3);
    expect(r).toMatchObject({ rowNumber: 3, firstName: 'james', lastName: 'okafor', dobIso: '1959-03-12', mrn: '201042', date: '2026-11-17', startMin: 840, category: 'scheduled', problems: [] });
    expect(apptKeyOf(r)).toBe('k:201042|2026-11-17T14:00|park dana md');
    expect(apptKeyOf({ ...r, apptId: 'E-77' })).toBe('id:E-77');
  });
  it('flags unreadable dates and missing times', () => {
    const r = normalizeRow(['11/31/2026', '', 'Okafor, James', '', '201042', '', ''], headers, mapping, DEFAULT_IMPORT_OPTIONS, 4);
    expect(r.date).toBeNull();
    expect(r.problems).toContain('Appointment date not readable');
    const r2 = normalizeRow(['11/17/2026', '', 'Okafor, James', '', '201042', '', ''], headers, mapping, DEFAULT_IMPORT_OPTIONS, 5);
    expect(r2.problems).toContain('No start time');
  });
  it('takes the time from a combined date-time column', () => {
    const r = normalizeRow(['11/17/2026 10:30 AM', '', 'Okafor, James', '', '201042', '', ''], headers, { ...mapping, apptTime: null }, DEFAULT_IMPORT_OPTIONS, 6);
    expect(r.startMin).toBe(630);
  });
});

describe('busy eCW times on the slot grid', () => {
  it('blocks every grid time an appointment overlaps', () => {
    expect(busySlotsOnGrid([{ date: '2026-11-17', startMin: 540, durationMin: 30 }])).toEqual([{ day: 'Tue Nov 17', time: '9:00 AM' }]);
    expect(busySlotsOnGrid([{ date: '2026-11-17', startMin: 525, durationMin: 30 }])).toEqual([{ day: 'Tue Nov 17', time: '9:00 AM' }]); // 8:45–9:15
    expect(busySlotsOnGrid([{ date: '2026-11-17', startMin: 480, durationMin: 60 }])).toEqual([]);                                      // 8:00–9:00
    expect(busySlotsOnGrid([{ date: '2026-11-17', startMin: 600, durationMin: 400 }]).map(s => s.time)).toEqual(['10:30 AM', '2:00 PM', '4:00 PM']);
  });
});

describe('stale import warning', () => {
  const now = new Date('2026-11-13T18:00:00Z');
  it('is stale when there has never been an import', () => {
    expect(importFreshness(null, now)).toEqual({ stale: true, never: true, hoursAgo: null });
  });
  it('is fresh within 24 hours and stale after', () => {
    expect(importFreshness(new Date('2026-11-13T08:00:00Z'), now)).toEqual({ stale: false, never: false, hoursAgo: 10 });
    expect(importFreshness(new Date('2026-11-12T18:30:00Z'), now).stale).toBe(false);
    expect(importFreshness(new Date('2026-11-12T17:00:00Z'), now)).toEqual({ stale: true, never: false, hoursAgo: 25 });
    expect(importFreshness('2026-11-13T08:00:00Z', now, 6).stale).toBe(true);
  });
});
