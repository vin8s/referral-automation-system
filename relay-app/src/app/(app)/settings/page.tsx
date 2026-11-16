'use client';

import { PageHead } from '@/components/layout/PageHead';
import { DemoDataSettings } from '@/components/screens/settings/DemoDataSettings';
import { TextingSettings } from '@/components/screens/settings/TextingSettings';
import { useSession } from '@/contexts/SessionContext';

export default function SettingsPage() {
  const { isAdmin } = useSession();
  return (
    <>
      <PageHead title="Settings" sub="Configure texting." />

      <div className="stack">
        <TextingSettings />
        {isAdmin && <DemoDataSettings />}
      </div>
    </>
  );
}
