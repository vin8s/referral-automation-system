// GET /api/calls/:callId — polls an ElevenLabs conversation for status + transcript.
// Signed-in staff only, and only when VOICE_ENABLED=true.

import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/server/auth/guard';
import { voiceEnabled, VOICE_OFF_MESSAGE } from '@/server/config';
import type { ElevenLabsCallResult } from '@/lib/types';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

type Ctx = { params: Promise<{ callId: string }> };

export const GET = withAuth(async (_request, { params }: Ctx) => {
  if (!voiceEnabled()) return jsonError(503, VOICE_OFF_MESSAGE);

  const { callId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(callId)) return jsonError(400, 'Bad call id');
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return jsonError(500, 'Missing ELEVENLABS_API_KEY');
  }

  const res = await fetch(`${ELEVENLABS_BASE}/convai/conversations/${callId}`, {
    headers: { 'xi-api-key': apiKey },
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: 'ElevenLabs fetch error', raw: err },
      { status: res.status },
    );
  }

  const data: ElevenLabsCallResult = await res.json();
  return NextResponse.json(data);
}, { name: 'calls/[callId]' });
