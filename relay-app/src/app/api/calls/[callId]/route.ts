import { NextResponse } from 'next/server';
import type { ElevenLabsCallResult } from '@/lib/types';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing ELEVENLABS_API_KEY' }, { status: 500 });
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
}
