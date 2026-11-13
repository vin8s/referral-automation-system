// POST /api/calls/initiate — places an outbound AI voice call (ElevenLabs + Twilio).
// Signed-in staff only, and only when VOICE_ENABLED=true (off for the SMS pilot).
// The number dialed is looked up from the referral on the server; a number sent
// by the browser is ignored, so this endpoint can't be used to call arbitrary phones.

import { NextResponse } from 'next/server';
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { voiceEnabled, VOICE_OFF_MESSAGE } from '@/server/config';
import { getPatientPhone } from '@/server/referrals';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export const POST = withAuth(async (request) => {
  if (!voiceEnabled()) return jsonError(503, VOICE_OFF_MESSAGE);

  const apiKey    = process.env.ELEVENLABS_API_KEY;
  const agentId   = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;

  if (!apiKey || !agentId || !phoneNumId) {
    return jsonError(500, 'Missing ElevenLabs env vars. Check .env.local.');
  }

  const body = await readJson<{
    referralId?: string;
    dynamicVariables?: Record<string, string>;
    conversationConfigOverride?: Record<string, unknown>;
  }>(request);
  if (!body) return jsonError(400, 'Invalid request body');

  const { referralId, dynamicVariables, conversationConfigOverride } = body;
  if (!referralId || typeof referralId !== 'string') {
    return jsonError(400, 'referralId is required');
  }
  const toNumber = await getPatientPhone(referralId);
  if (!toNumber) return jsonError(404, 'Referral not found or has no phone number');

  const payload: Record<string, unknown> = {
    agent_id: agentId,
    agent_phone_number_id: phoneNumId,
    to_number: toNumber,
  };

  const hasVars = dynamicVariables && Object.keys(dynamicVariables).length > 0;
  const hasOverride = conversationConfigOverride && Object.keys(conversationConfigOverride).length > 0;

  if (hasVars || hasOverride) {
    payload.conversation_initiation_client_data = {
      ...(hasVars ? { dynamic_variables: dynamicVariables } : {}),
      ...(hasOverride ? { conversation_config_override: conversationConfigOverride } : {}),
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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Status only — the response body can echo the phone number.
    console.error(`[relay] ElevenLabs initiate call failed: status=${res.status}`);
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
}, { name: 'calls/initiate' });
