// GET /api/schedule-import/taken-slots — slot-grid times that must not be offered:
// captured/confirmed in Relay plus busy times from the last eCW schedule import.
import { withAuth } from '@/server/auth/guard';
import { getTakenSlots } from '@/server/import';

export const GET = withAuth(async () => Response.json(await getTakenSlots()));
