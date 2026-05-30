import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { toNumber, dynamicVariables } = await req.json();

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const fromNumberId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;

  if (!apiKey || !agentId || !fromNumberId) {
    return NextResponse.json({ error: 'ElevenLabs env vars not configured' }, { status: 500 });
  }

  const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: agentId,
      to_number: toNumber,
      agent_phone_number_id: fromNumberId,
      conversation_initiation_client_data: {
        dynamic_variables: dynamicVariables,
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: data }, { status: res.status });
  }

  // ElevenLabs returns conversation_id; expose it as callId to the UI
  return NextResponse.json({ callId: data.conversation_id });
}
