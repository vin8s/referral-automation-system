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
  { id: 'alerts',    label: 'Urgent alerts', icon: 'alert',  href: '/alerts' },
  { id: 'action',    label: 'Confirm queue', icon: 'check',  href: '/action' },
  { id: 'referrals', label: 'Referrals',     icon: 'list',   href: '/referrals' },
  { id: 'calls',     label: 'Referral log',  icon: 'list',   href: '/calls' },
  { id: 'calendar',  label: 'Calendar',      icon: 'cal',    href: '/calendar' },
  { id: 'analytics', label: 'Analytics',     icon: 'chart',  href: '/analytics' },
];

const SYSTEM: NavItem[] = [
  { id: 'ingest',   label: 'Ingest',    icon: 'upload', href: '/ingest' },
  { id: 'settings', label: 'Settings',  icon: 'cog',    href: '/settings' },
];

interface SidebarCounts {
  urgentAlerts: number;
  confirmQueue: number;
  referrals: number;
}

function NavLink({ item, active, urgent, count }: { item: NavItem; active: boolean; urgent?: number; count?: number }) {
  return (
    <Link
      href={item.href}
      className={'nav-item' + (active ? ' active' : '')}
    >
      <Icon name={item.icon} size={15} />
      {item.label}
      {urgent ? (
        <span className="nav-count urgent">{urgent}</span>
      ) : count ? (
        <span className="nav-count">{count}</span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<SidebarCounts>({ urgentAlerts: 0, confirmQueue: 0, referrals: 0 });

  useEffect(() => {
    getSidebarCounts().then(setCounts);
  }, [pathname]);

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark">R</div>
        <div>
          <div className="sb-name">Relay</div>
          <div className="sb-sub">Bay Cardiology · Mission Bay</div>
        </div>
      </div>

      <div className="sb-section">Workspace</div>
      {WORKSPACE.map(item => (
        <NavLink
          key={item.id}
          item={item}
          active={pathname.startsWith(item.href)}
          urgent={item.id === 'alerts' ? counts.urgentAlerts : undefined}
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

      <button className="nav-item">
        <Icon name="logout" size={15} />
        Sign out
      </button>
    </aside>
  );
}
