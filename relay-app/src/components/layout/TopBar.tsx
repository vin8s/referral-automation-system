'use client';

import { Icon } from '@/components/shared/Icon';

export function TopBar() {
  return (
    <div className="tb">
      <div className="tb-search">
        <Icon name="search" size={14} />
        <input placeholder="Search patients, calls, transcripts…" aria-label="Search" />
        <span className="tb-kbd">⌘K</span>
      </div>
      <div className="tb-right">
        <button className="tb-pill">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--relay-accent)', flexShrink: 0 }} />
          Production · Mission Bay
          <Icon name="chevron" size={11} />
        </button>
        <button className="tb-iconbtn" aria-label="Notifications">
          <Icon name="bell" size={15} />
          <span className="tb-bell-dot" />
        </button>
        <button className="tb-avatar" title="Priya N. — Medical assistant" aria-label="Account">
          P
        </button>
      </div>
    </div>
  );
}
