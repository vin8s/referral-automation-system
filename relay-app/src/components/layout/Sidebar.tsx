'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/shared/Icon';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  urgent?: number;
  count?: number;
}

const WORKSPACE: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',     icon: 'home',   href: '/dashboard' },
  { id: 'alerts',    label: 'Urgent alerts', icon: 'alert',  href: '/alerts',   urgent: 1 },
  { id: 'action',    label: 'Confirm queue', icon: 'check',  href: '/action',   count: 2 },
  { id: 'referrals', label: 'Referrals',     icon: 'list',   href: '/referrals', count: 12 },
  { id: 'calls',     label: 'AI call log',   icon: 'phone',  href: '/calls' },
  { id: 'calendar',  label: 'Calendar',      icon: 'cal',    href: '/calendar' },
  { id: 'analytics', label: 'Analytics',     icon: 'chart',  href: '/analytics' },
];

const SYSTEM: NavItem[] = [
  { id: 'ingest',   label: 'Ingest',    icon: 'upload', href: '/ingest' },
  { id: 'settings', label: 'Settings',  icon: 'cog',    href: '/settings' },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={'nav-item' + (active ? ' active' : '')}
    >
      <Icon name={item.icon} size={15} />
      {item.label}
      {item.urgent ? (
        <span className="nav-count urgent">{item.urgent}</span>
      ) : item.count ? (
        <span className="nav-count">{item.count}</span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

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
        <NavLink key={item.id} item={item} active={pathname.startsWith(item.href)} />
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
