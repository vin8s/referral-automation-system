// Mock-derived configuration that has no database source yet (practice profile,
// read-only outreach policy). Served through /api/* so the browser never bundles
// mockData.ts. Replace with real queries as data becomes available.

import 'server-only';
import { org, settingsDefaults } from '@/lib/mockData';
import type { Org } from '@/lib/types';

export const getOrg = (): Org => org;
export const getRawSettings = () => settingsDefaults;
