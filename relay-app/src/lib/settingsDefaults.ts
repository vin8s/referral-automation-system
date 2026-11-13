// Default practice settings, shared by the seed script and the server.
// Pure constants — safe to import anywhere.

import type { PracticeSettings } from './types';

export const VALID_CALL_ORDERS = ['chronological', 'urgent_first', 'all', 'fewest_attempts'] as const;

export const DEFAULT_SETTINGS: PracticeSettings = {
  cadence: { intervalMinutes: 5, maxCallsPerSession: 10, callOrder: 'chronological' },
};
