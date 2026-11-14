// GET /api/confirm-queue — the MA's single work list, in priority order:
// red escalations (safety) → amber "needs a human" items → slots to confirm.
import { withAuth } from '@/server/auth/guard';
import { listConfirmQueue, listEscalations } from '@/server/referrals';
import { listNeedsHuman, withSmsExcerpts } from '@/server/sms';
import type { ConfirmQueue } from '@/lib/types';

export const GET = withAuth(async () => {
  const [escalations, needsHuman, slots] = await Promise.all([
    listEscalations(),
    listNeedsHuman(),
    listConfirmQueue().then(withSmsExcerpts),
  ]);
  return Response.json({ escalations, needsHuman, slots } satisfies ConfirmQueue);
});
