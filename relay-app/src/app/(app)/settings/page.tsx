'use client';

import { PageHead } from '@/components/layout/PageHead';
import { TextingSettings } from '@/components/screens/settings/TextingSettings';
import { EpicSettings } from '@/components/screens/settings/EpicSettings';

export default function SettingsPage() {
  return (
    <>
      <PageHead title="Settings" sub="Configure texting." />

      <div className="stack">
        <TextingSettings />
        <EpicSettings />
      </div>
    </>
  );
}
