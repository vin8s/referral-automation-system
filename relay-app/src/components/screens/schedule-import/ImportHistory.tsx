'use client';

// Past eCW imports: who, when, file, dates covered, counts, and the review rows
// of each import (opened inline).

import { Fragment, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Icon } from '@/components/shared/Icon';
import { getScheduleImportDetail } from '@/lib/data';
import type { EcwImportDetail, EcwImportSummary } from '@/lib/types';
import { ReviewList } from './ReviewList';

function Detail({ importId, onChanged }: { importId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<EcwImportDetail | null>(null);
  const load = useCallback(() => { getScheduleImportDetail(importId).then(setDetail).catch(() => setDetail(null)); }, [importId]);
  useEffect(() => { load(); }, [load]);
  if (!detail) return <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>Loading…</div>;
  return <ReviewList items={detail.review} onChanged={() => { load(); onChanged(); }} />;
}

export function ImportHistory({ imports, openId, onOpen, onChanged }: {
  imports: EcwImportSummary[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  onChanged: () => void;
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: '16px 20px 12px', marginBottom: 0, borderBottom: '1px solid var(--relay-hairline)' }}>
        <div>
          <h3>Import history</h3>
          <p className="card-sub">Applied imports, newest first. Open one to see its review rows.</p>
        </div>
      </div>
      {imports.length === 0 ? (
        <EmptyState icon="history" title="No imports yet" sub="Upload today's eCW appointment report above." />
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Applied</th>
              <th>By</th>
              <th>File</th>
              <th>Dates covered</th>
              <th style={{ textAlign: 'right' }}>Rows</th>
              <th style={{ textAlign: 'right' }}>Matched</th>
              <th style={{ textAlign: 'right' }}>Booked</th>
              <th style={{ textAlign: 'right' }}>Updated</th>
              <th style={{ textAlign: 'right' }}>Back to outreach</th>
              <th style={{ textAlign: 'right' }}>Review</th>
              <th style={{ textAlign: 'right' }}>Not in Relay</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {imports.map(i => {
              const c = i.counts;
              const open = openId === i.id;
              return (
                <Fragment key={i.id}>
                  <tr className="row-clickable" onClick={() => onOpen(open ? null : i.id)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{i.appliedAt}</td>
                    <td>{i.appliedBy}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--relay-ink-2)' }}>{i.fileName}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--relay-ink-2)' }}>{i.rangeStart}{i.rangeEnd && i.rangeEnd !== i.rangeStart ? ` – ${i.rangeEnd}` : ''}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>{c?.total ?? '—'}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>{c?.matched ?? '—'}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>{c ? c.booked + c.visits : '—'}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>{c?.updated ?? '—'}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>{c?.reentered ?? '—'}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {i.openReview > 0
                        ? <span style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 99, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)', fontWeight: 500 }}>{i.openReview} open</span>
                        : (c?.review ?? 0)}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', color: 'var(--relay-ink-3)' }}>{c?.ignored ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined, color: 'var(--relay-ink-3)' }}><Icon name="chevron" size={12} /></span>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={12} style={{ background: 'var(--relay-tint)', height: 'auto', padding: '14px 16px' }}>
                        <Detail importId={i.id} onChanged={onChanged} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
