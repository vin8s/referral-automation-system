import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { patchLatestTranscript } from '@/server/referrals';
import type { TranscriptTurn } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

// PATCH { turns } — attach a late-arriving transcript to the newest attempt.
export const PATCH = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  const body = await readJson<{ turns?: TranscriptTurn[] }>(req);
  if (!validId(id) || !Array.isArray(body?.turns)) return jsonError(400, 'Expected { turns }');
  return Response.json(await patchLatestTranscript(id, body!.turns!, user));
});
