'use client';

import { useState } from 'react';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';

type RowStatus = 'ok' | 'flag';

interface IngestRow {
  name: string;
  phone: string;
  reason: string;
  by: string;
  lang: string;
  ins: string;
  flag?: string;
}

const SAMPLE_ROWS: IngestRow[] = [
  { name: 'Eleni Markova', phone: '+1 (415) 555-0114', reason: 'Palpitations', by: 'Dr. Estrada', lang: 'English', ins: 'Aetna' },
  { name: 'Carlos Mendoza', phone: '+1 (415) 555-0177', reason: 'Hypertension', by: 'Dr. Lee', lang: 'Spanish', ins: 'Anthem' },
  { name: 'Devon Park', phone: '+1 (404) 555-OOOO', reason: 'Stress test', by: 'Dr. Brooks', lang: 'English', ins: 'Cigna', flag: 'Bad phone' },
  { name: 'Anya Petrov', phone: '+1 (415) 555-0199', reason: 'AFib follow-up', by: 'Dr. Chen', lang: 'English', ins: 'Medicare' },
  { name: 'Aisha Patel', phone: '+1 (415) 555-0156', reason: 'HTN consult', by: 'Dr. Brooks', lang: 'English', ins: 'Kaiser', flag: 'Possible duplicate of REF-1042' },
  { name: 'Tom Avery', phone: '+1 (415) 555-0123', reason: 'Pre-op clearance', by: 'Dr. Reyes', lang: 'English', ins: 'Aetna' },
  { name: 'Sun Min Cho', phone: '+1 (415) 555-0148', reason: '—', by: 'SF General', lang: 'Korean', ins: 'Medicare', flag: 'Missing reason' },
];

export default function IngestPage() {
  const [showPreview, setShowPreview] = useState(false);
  const [imported, setImported] = useState(false);

  const flagCount = SAMPLE_ROWS.filter(r => r.flag).length;
  const okCount = SAMPLE_ROWS.filter(r => !r.flag).length;

  function handleFakeUpload() {
    setShowPreview(true);
  }

  function handleImport() {
    setImported(true);
  }

  return (
    <>
      <PageHead
        title="Ingest referrals"
        sub="Manual upload first · EHR + fax connectors fast-follow"
      >
        <button className="btn btn-sm"><Icon name="history" size={12} /> History</button>
      </PageHead>

      {!imported ? (
        <>
          {/* Drop zone */}
          <div
            className="card"
            style={{
              borderStyle: 'dashed', borderColor: 'var(--relay-hairline-strong)',
              padding: 28, textAlign: 'center', background: 'var(--relay-tint)',
              cursor: 'pointer',
            }}
            onClick={handleFakeUpload}
          >
            <Icon name="upload" size={24} />
            <div className="fw-6" style={{ marginTop: 6, fontSize: 15 }}>Drop a CSV or PDF here</div>
            <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', marginTop: 2 }}>
              Up to 500 rows · we&apos;ll parse, validate, and let you review before commit
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={e => { e.stopPropagation(); handleFakeUpload(); }}>
                <Icon name="upload" size={12} /> Choose file
              </button>
              <button className="btn" onClick={e => { e.stopPropagation(); handleFakeUpload(); }}>
                Paste from clipboard
              </button>
            </div>
          </div>

          {/* Preview */}
          {showPreview && (
            <div style={{ marginTop: 22 }}>
              <div className="between" style={{ marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Preview · {SAMPLE_ROWS.length} rows parsed</h3>
                  <p className="card-sub">{okCount} ready · {flagCount} flagged · review before commit</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm">Fix all flags</button>
                  <button className="btn btn-sm btn-primary" onClick={handleImport}>
                    <Icon name="check" size={12} /> Import {SAMPLE_ROWS.length} referrals
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 'var(--relay-radius)', overflow: 'hidden' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th />
                      <th>Patient</th>
                      <th>Phone</th>
                      <th>Reason</th>
                      <th>Referring</th>
                      <th>Language</th>
                      <th>Insurance</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_ROWS.map((r, i) => (
                      <tr key={i} style={{ background: r.flag ? 'var(--relay-urgent-50)' : undefined }}>
                        <td>
                          {r.flag
                            ? <span style={{ color: 'var(--relay-urgent)' }}><Icon name="alert" size={13} /></span>
                            : <span style={{ color: 'var(--relay-accent)' }}><Icon name="check" size={13} /></span>}
                        </td>
                        <td style={{ fontWeight: 500 }}>{r.name}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: r.flag === 'Bad phone' ? '#b91c1c' : undefined }}>
                          {r.phone}
                        </td>
                        <td style={{ color: 'var(--relay-ink-2)' }}>{r.reason}</td>
                        <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.by}</td>
                        <td style={{ color: 'var(--relay-ink-2)' }}>{r.lang}</td>
                        <td style={{ color: 'var(--relay-ink-2)' }}>{r.ins}</td>
                        <td>
                          {r.flag && (
                            <span style={{ fontSize: 11.5, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)', padding: '2px 7px', borderRadius: 99, fontWeight: 500 }}>
                              {r.flag}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
                <Icon name="info" size={12} /> Importing will create referrals in Ingested state and immediately queue the AI cadence for each. You can review before the first attempt fires.
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--st-booked-bg)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--relay-accent)' }}>
            <Icon name="check" size={24} />
          </div>
          <div className="fw-6" style={{ fontSize: 16 }}>
            {okCount} referrals imported successfully
          </div>
          <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', marginTop: 6 }}>
            {flagCount} flagged rows were skipped · AI cadence queued for all imported referrals
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', marginTop: 8 }}>(prototype — no real data written)</div>
        </div>
      )}
    </>
  );
}
