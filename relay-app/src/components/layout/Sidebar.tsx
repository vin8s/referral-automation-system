'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { getSidebarCounts } from '@/lib/data';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
}

const WORKSPACE: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',     icon: 'home',   href: '/dashboard' },
  { id: 'action',    label: 'Confirm queue', icon: 'check',  href: '/action' },
  { id: 'referrals', label: 'Referrals',     icon: 'list',   href: '/referrals' },
  { id: 'messages',  label: 'Messages log',  icon: 'sms',    href: '/messages' },
  { id: 'calendar',  label: 'Calendar',      icon: 'cal',    href: '/calendar' },
];

const SYSTEM: NavItem[] = [
  { id: 'ingest',   label: 'Ingest referrals', icon: 'upload',  href: '/ingest' },
  { id: 'ecw',      label: 'eCW import',       icon: 'refresh', href: '/schedule-import' },
  { id: 'settings', label: 'Settings',         icon: 'cog',     href: '/settings' },
];

type SidebarCounts = Awaited<ReturnType<typeof getSidebarCounts>>;

const EMPTY_COUNTS: SidebarCounts = { escalations: 0, needsHuman: 0, confirmQueue: 0, referrals: 0 };

/**
 * Badges keep the two-tier urgency distinct: red = open escalations (safety),
 * amber = "needs a human" items, neutral = slots to confirm / open referrals.
 */
function NavLink({ item, active, escalated, needsHuman, count }: {
  item: NavItem; active: boolean; escalated?: number; needsHuman?: number; count?: number;
}) {
  return (
    <Link
      href={item.href}
      className={'nav-item' + (active ? ' active' : '')}
    >
      <Icon name={item.icon} size={15} />
      {item.label}
      {(escalated || needsHuman || count) ? (
        <span className="nav-counts">
          {escalated ? <span className="nav-count escalated" title={`${escalated} escalated`}>{escalated}</span> : null}
          {needsHuman ? <span className="nav-count urgent" title={`${needsHuman} need a human`}>{needsHuman}</span> : null}
          {count ? <span className="nav-count" title={`${count} waiting`}>{count}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY_COUNTS);

  useEffect(() => {
    getSidebarCounts().then(setCounts).catch(() => setCounts(EMPTY_COUNTS));
  }, [pathname]);

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark">R</div>
        <div>
          <div className="sb-name">Relay</div>
          <div className="sb-sub">Rhode Island Free Clinic · Providence</div>
        </div>
      </div>

      <div className="sb-section">Workspace</div>
      {WORKSPACE.map(item => (
        <NavLink
          key={item.id}
          item={item}
          active={pathname.startsWith(item.href)}
          escalated={item.id === 'action' ? counts.escalations : undefined}
          needsHuman={item.id === 'action' ? counts.needsHuman : undefined}
          count={
            item.id === 'action'    ? counts.confirmQueue :
            item.id === 'referrals' ? counts.referrals    : undefined
          }
        />
      ))}

      <div className="sb-section">System</div>
      {SYSTEM.map(item => (
        <NavLink key={item.id} item={item} active={pathname.startsWith(item.href)} />
      ))}

      <div className="sb-spacer" />

      <form action="/api/auth/logout" method="post">
        <button type="submit" className="nav-item">
          <Icon name="logout" size={15} />
          Sign out
        </button>
      </form>
    </aside>
  );
}
