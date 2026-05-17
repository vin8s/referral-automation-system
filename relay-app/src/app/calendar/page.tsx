import React from 'react';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';

const DAYS = ['Mon Apr 14', 'Tue Apr 15', 'Wed Apr 16', 'Thu Apr 17', 'Fri Apr 18'];
const TIMES = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'];

const APPTS = [
  { d: 0, t: 1, who: 'Helena Brandt', note: 'Pre-op', state: 'booked' },
  { d: 0, t: 5, who: '(shadow) Marcus Bell', note: 'Tentative', state: 'shadow' },
  { d: 1, t: 0, who: 'Linh Pham', note: 'CHF mgmt', state: 'booked' },
  { d: 1, t: 2, who: 'Aisha Patel', note: 'HTN consult', state: 'booked' },
  { d: 1, t: 6, who: 'James Okafor', note: 'AFib f/u', state: 'accepted' },
  { d: 2, t: 3, who: 'Robert Klein', note: 'Post-MI f/u', state: 'accepted' },
  { d: 2, t: 7, who: 'Beatriz Coelho', note: 'Palpitations', state: 'booked' },
  { d: 3, t: 2, who: '(shadow) New referral', note: 'Tentative', state: 'shadow' },
  { d: 4, t: 1, who: 'Sofia Reyes', note: 'Screening', state: 'booked' },
];

export default function CalendarPage() {
  const dayApptCounts = DAYS.map((_, di) => APPTS.filter(a => a.d === di && a.state !== 'shadow').length);

  return (
    <>
      <PageHead
        title="Calendar"
        sub="Confirmed bookings · shadow mirror entries shown dashed (read-only · MVP)"
      >
        <div className="variations">
          <button className="variation-btn">Day</button>
          <button className="variation-btn active">Week</button>
        </div>
        <button className="btn btn-sm"><Icon name="user" size={12} /> All providers</button>
        <button className="btn btn-sm"><Icon name="map" size={12} /> All locations</button>
      </PageHead>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
        <span>Apr 14–18 · this week</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="cal-appt" style={{ margin: 0, padding: '2px 8px' }}>Booked</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="cal-appt shadow" style={{ margin: 0, padding: '2px 8px' }}>Shadow mirror</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11.5, background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>Awaiting MA</span>
        </span>
      </div>

      <div className="cal-grid">
        {/* Header row */}
        <div className="cal-hd" />
        {DAYS.map((d, di) => (
          <div key={d} className="cal-hd">
            <span>{d.split(' ').slice(0, 2).join(' ')}</span>
            <span>{dayApptCounts[di]} booked</span>
          </div>
        ))}

        {/* Time rows */}
        {TIMES.map((t, ti) => (
          <React.Fragment key={`row-${ti}`}>
            <div className="cal-cell timecol">{t}</div>
            {DAYS.map((_, di) => {
              const cellAppts = APPTS.filter(a => a.d === di && a.t === ti);
              return (
                <div key={`${ti}-${di}`} className="cal-cell">
                  {cellAppts.map((a, i) => (
                    <div
                      key={i}
                      className={`cal-appt${a.state === 'shadow' ? ' shadow' : ''}`}
                      style={a.state === 'accepted' ? {
                        background: 'var(--st-accepted-bg)',
                        borderColor: 'var(--st-accepted-fg)',
                        color: 'var(--st-accepted-fg)',
                      } : undefined}
                    >
                      <div style={{ fontWeight: 500 }}>{a.who}</div>
                      <div style={{ fontSize: 10.5 }}>{a.note}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)', borderRadius: 6, fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
        <Icon name="info" size={12} /> Shadow entries (dashed) are read-only mirror views of AI-captured slots pending confirmation. They do not represent commits in your practice system.
      </div>
    </>
  );
}
