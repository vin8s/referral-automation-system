// GET /api/dashboard/call-activity | funnel | health
import { withAuth, jsonError } from '@/server/auth/guard';
import { getCallActivity, getFunnel, getHealthSignals } from '@/server/staticData';

type Ctx = { params: Promise<{ part: string }> };

export const GET = withAuth(async (_req, { params }: Ctx) => {
  const { part } = await params;
  if (part === 'call-activity') return Response.json(getCallActivity());
  if (part === 'funnel') return Response.json(getFunnel());
  if (part === 'health') return Response.json(await getHealthSignals());
  return jsonError(404, 'Not found');
});
