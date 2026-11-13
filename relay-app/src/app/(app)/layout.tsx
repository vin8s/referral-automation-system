// Shell for every signed-in screen. Re-checks the session on the server
// (src/proxy.ts is only the first gate) and hands the user + feature flags to
// client components through SessionContext.

import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { ActiveCallBanner } from '@/components/shared/ActiveCallBanner';
import { requireUser } from '@/server/auth/guard';
import { voiceEnabled } from '@/server/config';
import { Providers } from '../providers';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <Providers user={user} voiceEnabled={voiceEnabled()}>
      <Sidebar />
      <div className="main">
        <TopBar />
        <ActiveCallBanner />
        <div className="pg">{children}</div>
      </div>
    </Providers>
  );
}
