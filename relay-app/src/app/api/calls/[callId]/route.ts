import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs env vars not configured' }, { status: 500 });
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${callId}`, {
    headers: { 'xi-api-key': apiKey },
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: data }, { status: res.status });
  }

  // Map ElevenLabs response to ElevenLabsCallResult shape expected by the UI
  return NextResponse.json({
    conversation_id: data.conversation_id ?? callId,
    status: data.status === 'done' ? 'done' : data.status === 'failed' ? 'failed' : 'processing',
    transcript: data.transcript ?? [],
    metadata: data.metadata ?? {},
    analysis: data.analysis ?? {},
  });
}
