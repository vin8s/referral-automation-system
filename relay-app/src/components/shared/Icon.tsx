'use client';

import { cn } from '@/lib/utils';

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 16, className, style }: IconProps) {
  const cls = cn('inline-block flex-shrink-0', className);
  const s = size;
  const svgStyle = style;

  switch (name) {
    case 'home':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5H10.5V10h-5v4.5H2.5A.5.5 0 012 14V6.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>;
    case 'alert':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M8 2.5L14 13H2L8 2.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/><path d="M8 7v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="11.5" r=".75" fill="currentColor"/></svg>;
    case 'check':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'list':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M3 4h10M3 8h10M3 12h7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'phone':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M4.5 2h2.3l1 3-1.5 1c.7 1.3 2.2 2.8 3.5 3.5l1-1.5 3 1V11.5A.5.5 0 0113.5 12C7 12 4 5 4 2.5a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>;
    case 'cal':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25"/><path d="M2 7h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'chart':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M2 12V8l4-3 3 2.5 5-5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12h12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'upload':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M8 10V3m0 0L5 6m3-3l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 11v1.5A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'cog':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.25"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'logout':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M6 3H3.5A1.5 1.5 0 002 4.5v7A1.5 1.5 0 003.5 13H6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/><path d="M10 5l3 3-3 3M13 8H6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'search':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25"/><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'bell':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M8 2a4 4 0 00-4 4v3l-1.5 2h11L12 9V6a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/><path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.25"/></svg>;
    case 'chevron':
      return <svg width={s} height={s} viewBox="0 0 12 12" fill="none" className={cls}><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'arrow':
      return <svg width={s} height={s} viewBox="0 0 12 12" fill="none" className={cls}><path d="M2.5 6h7M7 3.5l2.5 2.5L7 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'x':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
    case 'transcript':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'play':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M4 3l7 4-7 4V3z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" fill="currentColor" fillOpacity=".15"/></svg>;
    case 'pause':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M4 3v8M10 3v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case 'flag':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M3 2v10M3 3h8L9 7h2l-2 4H3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'edit':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M2 10l7.5-7.5 2 2L4 12H2v-2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>;
    case 'user':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.25"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'filter':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'download':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M7 2v7m0 0l-2.5-2.5M7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 11h10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'map':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M6 3L2 5v9l4-2 4 2 4-2V3l-4 2-4-2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/><path d="M6 3v9M10 5v9" stroke="currentColor" strokeWidth="1.25"/></svg>;
    case 'shield':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M7 2L2 4v4c0 3 2.5 5 5 5s5-2 5-5V4L7 2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>;
    case 'history':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><path d="M3 8a5 5 0 105-5H3M3 3v5h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 6v2.5l2 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'info':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25"/><path d="M7 6.5V10M7 4.5v.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'plus':
      return <svg width={s} height={s} viewBox="0 0 12 12" fill="none" className={cls}><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
    case 'link':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M6 4H4a3 3 0 000 6h2M8 4h2a3 3 0 010 6H8M4.5 7h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'sms':
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none" className={cls}><rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25"/><path d="M5 14l1.5-2h3L11 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>;
    case 'refresh':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M2 7a5 5 0 005 5 5 5 0 004.8-3.6M12 7a5 5 0 00-5-5 5 5 0 00-4.8 3.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/><path d="M2 4v3h3M12 10v-3h-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'trash':
      return <svg width={s} height={s} viewBox="0 0 14 14" fill="none" className={cls}><path d="M2 4h10M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6.5v4M8.5 6.5v4M3 4l.7 7a1 1 0 001 .9h4.6a1 1 0 001-.9L11 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    default:
      return <svg width={s} height={s} viewBox="0 0 16 16" className={cls}><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.25" fill="none"/></svg>;
  }
}
