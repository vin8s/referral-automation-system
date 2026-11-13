// Feature flags read from the environment.

/** Outbound voice calls (ElevenLabs + Twilio). Off unless VOICE_ENABLED=true. */
export function voiceEnabled(): boolean {
  return process.env.VOICE_ENABLED?.toLowerCase() === 'true';
}

export const VOICE_OFF_MESSAGE = 'Voice is off for the pilot. Set VOICE_ENABLED=true on the server to enable calls.';
