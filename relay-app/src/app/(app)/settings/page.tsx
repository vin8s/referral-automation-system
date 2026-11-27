'use client';

import { PageHead } from '@/components/layout/PageHead';
import { DemoDataSettings } from '@/components/screens/settings/DemoDataSettings';
import { TextingSettings } from '@/components/screens/settings/TextingSettings';
import { EpicSettings } from '@/components/screens/settings/EpicSettings';
import { useSession } from '@/contexts/SessionContext';

export default function SettingsPage() {
  const { isAdmin } = useSession();
  return (
    <>
      <PageHead title="Settings" sub="Configure texting, the Epic sandbox prototype and demo data." />

      <div className="stack">
        <TextingSettings />
        <EpicSettings />
        {isAdmin && <DemoDataSettings />}
      </div>
    </>
  );
}
