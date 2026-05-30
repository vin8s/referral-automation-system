import { NextResponse } from 'next/server';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export async function POST(request: Request) {
  const apiKey    = process.env.ELEVENLABS_API_KEY;
  const agentId   = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;

  if (!apiKey || !agentId || !phoneNumId) {
    return NextResponse.json(
      { error: 'Missing ElevenLabs env vars. Check .env.local.' },
      { status: 500 },
    );
  }

  let body: { toNumber: string; referralId: string; dynamicVariables?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { toNumber, referralId, dynamicVariables } = body;
  if (!toNumber) {1
    return NextResponse.json({ error: 'toNumber is required' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    agent_id: agentId,
    agent_phone_number_id: phoneNumId,
    to_number: toNumber,
  };

  if (dynamicVariables && Object.keys(dynamicVariables).length > 0) {
    payload.conversation_initiation_client_data = {
      dynamic_variables: dynamicVariables,
    };
  }

  const res = await fetch(`${ELEVENLABS_BASE}/convai/twilio/outbound-call`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[ElevenLabs] initiate call error:', data);
    const detail = data?.detail;
    const errorMsg: string = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join('; ')
        : typeof detail === 'object' && detail !== null
          ? JSON.stringify(detail)
          : 'ElevenLabs API error';
    return NextResponse.json({ error: errorMsg, raw: data }, { status: res.status });
  }

  return NextResponse.json({
    callId: data.conversation_id ?? data.conversationId ?? data.call_id ?? null,
    callSid: data.callSid ?? data.call_sid ?? null,
    referralId,
    raw: data,
  });
}
