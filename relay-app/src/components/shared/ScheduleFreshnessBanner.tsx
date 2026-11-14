'use client';

// Amber "needs a human" strip shown when the eCW schedule in Relay may be stale
// (no import in ~24 h) or imported rows are waiting for a staff decision.
// Soft amber (--relay-urgent-*), never the red Escalated treatment: it does not
// change any referral state. Renders nothing when the schedule is fresh.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { getScheduleImportStatus } from '@/lib/data';
import type { EcwImportStatus } from '@/lib/types';

export function ScheduleFreshnessBanner({ style }: { style?: React.CSSProperties }) {
  const [status, setStatus] = useState<EcwImportStatus | null>(null);

  useEffect(() => {
    getScheduleImportStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status || (!status.stale && status.openReview === 0)) return null;

  const title = status.never
    ? 'No eCW schedule imported yet — schedule data may be stale'
    : status.stale
      ? `eCW schedule last imported ${status.hoursAgo} hours ago — schedule data may be stale`
      : `${status.openReview} eCW row${status.openReview === 1 ? '' : 's'} need${status.openReview === 1 ? 's' : ''} a decision`;
  const sub = status.stale
    ? 'Bookings, cancellations and no-shows made in eCW since then are not in Relay yet. Run the eCW appointment report and upload it.'
    : 'Relay could not safely match these appointments to a referral. Pick the referral or ignore the row.';

  return (
    <div className="alerts-strip" style={{ marginBottom: 16, ...style }} role="status">
      <div style={{
        width: 28, height: 28, borderRadius: 8, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <Icon name="refresh" size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>
          {sub}
          {status.stale && status.openReview > 0 && ` ${status.openReview} imported row${status.openReview === 1 ? '' : 's'} also need a decision.`}
        </div>
      </div>
      <Link href="/schedule-import">
        <button className="btn btn-sm">
          <Icon name="upload" size={12} /> {status.stale ? 'Import schedule' : 'Review rows'}
        </button>
      </Link>
    </div>
  );
}
