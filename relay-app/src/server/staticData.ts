// Mock-derived figures that have no database source yet (marketing-style analytics,
// dashboard sparklines, practice profile). Served through /api/* so the browser
// never bundles mockData.ts. Replace with real queries as data becomes available.

import 'server-only';
import {
  org, analytics, dashboardCallActivity, dashboardFunnel, settingsDefaults,
} from '@/lib/mockData';
import type { Analytics, DashboardFunnelStep, DashboardHealthSignals, Org } from '@/lib/types';
import { getEscalatedCount } from './referrals';

export const getOrg = (): Org => org;
export const getAnalytics = (): Analytics => analytics;
export const getCallActivity = () => dashboardCallActivity;
export const getFunnel = (): DashboardFunnelStep[] => [...dashboardFunnel];
export const getRawSettings = () => settingsDefaults;

export async function getHealthSignals(): Promise<DashboardHealthSignals> {
  return {
    status: 'normal',
    disclosureRatePct: analytics.compliance.aiDisclosureRate,
    quietHoursAdherencePct: analytics.compliance.quietHourAdherence,
    avgTimeToFirstAttemptMin: dashboardCallActivity.avgTimeToFirstAttemptMin,
    escalationsTriggered: await getEscalatedCount(),
    shadowCalendarFidelityPct: analytics.shadowFidelity.currentPct,
    optOutsHonored: analytics.compliance.optOutsHonored,
  };
}
