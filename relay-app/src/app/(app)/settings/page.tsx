'use client';

import { PageHead } from '@/components/layout/PageHead';
import { TextingSettings } from '@/components/screens/settings/TextingSettings';

export default function SettingsPage() {
  return (
    <>
      <PageHead title="Settings" sub="Configure texting." />

      <div className="stack">
        <TextingSettings />
      </div>
    </>
  );
}
