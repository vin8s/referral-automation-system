// SMS agent model adapters behind one interface (swap via AI_PROVIDER=mock|bedrock).
//
//   mock (default): deterministic rule-based stand-in for local demos and tests.
//                   NOT a safety layer and NOT production behavior.
//   bedrock:        Claude on Amazon Bedrock via the Bedrock Runtime Converse API
//                   (IAM: bedrock:InvokeModel), model BEDROCK_MODEL_ID, tool `sms_turn`
//                   with the JSON schema from docs/SMS_AGENT_PROMPT.md §4, toolChoice auto.
//
// The model only ever receives: clinic name, patient FIRST name, the SMS thread,
// and the turn context (SMS_AGENT_PROMPT §3). Never the DOB, referral reason or specialty.

import 'server-only';
import { buildSystemPrompt, SMS_TURN_SCHEMA, TURN_CONTEXT_NOTE } from './prompt';
import { detectEmergency, normalizeDob, normalizeText, redTemplateFor } from './guards';
import type { ModelInput, SmsTurnOutput } from './types';

export interface SmsAgentModel {
  readonly name: 'mock' | 'bedrock' | 'scripted';
  /** Returns the raw tool input (validated by the caller), or throws on transport errors. */
  turn(input: ModelInput): Promise<unknown>;
}

// ── Mock ────────────────────────────────────────────────────────────────────

function base(lang: 'en' | 'es'): SmsTurnOutput {
  return {
    reply_text: null, use_template: null, language: lang, language_switch_request: null, intent: 'other',
    identity: { dob_candidate: null, says_not_patient: false, says_is_proxy: false },
    captured_slot: null, preferences: null, friction: [],
    escalation: { tier: 'none', reason_code: null, pause_automation: false, staff_summary: null },
    opt_out: false, help_requested: false, wrong_number: false, call_outcome: null, conversation_complete: false,
  };
}

const ORDINALS: [RegExp, number][] = [
  [/^(1|one|uno|the first( one)?|first( one)?|la primera|el primero|primera|primero|#1|option 1)$/, 0],
  [/^(2|two|dos|the second( one)?|second( one)?|la segunda|el segundo|segunda|segundo|#2|option 2)$/, 1],
  [/^(3|three|tres|the third( one)?|third( one)?|la tercera|el tercero|tercera|tercero|#3|option 3)$/, 2],
];
const DAY_NAMES: [RegExp, number][] = [
  [/\b(mon|monday|lunes)\b/, 1], [/\b(tue|tues|tuesday|martes)\b/, 2], [/\b(wed|wednesday|miercoles)\b/, 3],
  [/\b(thu|thur|thurs|thursday|jueves)\b/, 4], [/\b(fri|friday|viernes)\b/, 5], [/\b(sat|saturday|sabado)\b/, 6],
];

/** Deterministic stand-in good enough to demo the flow locally. */
export class MockSmsAgentModel implements SmsAgentModel {
  readonly name = 'mock' as const;

  async turn(input: ModelInput): Promise<SmsTurnOutput> {
    const ctx = input.context;
    const lang = ctx.locked_language;
    const es = lang === 'es';
    const t = normalizeText(input.patientMessage);
    const out = base(lang);
    const amber = (code: string, pause: boolean, summary: string, template: SmsTurnOutput['use_template'] = pause ? 'human_handoff' : null) => {
      out.escalation = { tier: 'amber', reason_code: code, pause_automation: pause, staff_summary: summary };
      out.use_template = template;
      return out;
    };

    const red = detectEmergency(input.patientMessage)
      ?? (/\bchest pain\b|\bdolor de pecho\b/.test(t) && !/\blast year\b|\byears ago\b|\bel ano pasado\b/.test(t) ? { code: 'emergency_medical' as const } : null);
    if (red) {
      out.intent = red.code === 'suicide_self_harm' ? 'crisis_self_harm' : 'emergency';
      out.escalation = { tier: 'red', reason_code: red.code, pause_automation: true, staff_summary: `Patient texted: "${input.patientMessage.slice(0, 200)}"` };
      out.use_template = redTemplateFor(red.code);
      out.call_outcome = 'Escalated';
      return out;
    }
    if (/\b(stop|dont) text(ing)? me\b|\btake me off\b|\bno me manden\b|\bno me escriban\b|\bno quiero mas (textos|mensajes)\b|\bstop harassing\b/.test(t)) {
      out.intent = 'opt_out'; out.opt_out = true; out.use_template = 'stop_confirmation'; return out;
    }
    if (/\bwrong number\b|\bdont know (this|that) person\b|\bnumero equivocado\b|\bno conozco\b|\bno soy esa persona\b/.test(t)) {
      out.intent = 'wrong_number'; out.wrong_number = true; out.use_template = 'wrong_number'; out.call_outcome = 'Wrong Number';
      out.escalation = { tier: 'amber', reason_code: 'wrong_number', pause_automation: true, staff_summary: 'Person says this is a wrong number.' };
      return out;
    }
    if (/\b(im|soy) (her|his|la|el) (daughter|son|wife|husband|mom|mother|hija|hijo|esposa|esposo|mama)\b|\bsoy (la|el) (hija|hijo|esposa|esposo)\b/.test(t)) {
      out.intent = 'proxy_or_caregiver'; out.identity.says_is_proxy = true;
      return amber('proxy_or_caregiver', true, 'Someone other than the patient is replying.');
    }
    if (/\b(real person|human|someone call|talk to (a )?(person|someone))\b|\bhablar con (alguien|una persona)\b|\bpersona de verdad\b/.test(t) && !/\bare you\b|\busted es\b/.test(t)) {
      out.intent = 'human_request'; return amber('human_requested', true, 'Patient asked for a person.');
    }
    if (/\b(are you|is this) (a )?(bot|robot|real|ai|computer)\b|\busted es (una persona|un robot)\b|\bpersona de verdad\b/.test(t)) {
      out.intent = 'ai_question';
      out.reply_text = es
        ? 'Sí, soy un asistente automatizado (IA). Si quiere, le pido a alguien del personal que se comunique con usted.'
        : "Yes, I'm an automated assistant (AI). I can ask a staff member to contact you if you'd like.";
      return out;
    }
    if (/\b(cost|price|pay|insurance|medicaid|medicare)\b|\bcuanto cuesta\b|\bseguro\b/.test(t)) {
      out.intent = 'cost_insurance_question'; out.friction = ['cost'];
      out.reply_text = es
        ? 'No puedo responder preguntas de costos, pero alguien del personal le va a contactar. ¿Quiere escoger un horario mientras tanto?'
        : "I can't answer cost questions, but a staff member will contact you about it. Want to pick a time meanwhile?";
      return amber('cost_insurance_question', false, 'Patient asked about cost or insurance.', null);
    }
    if (/\b(why|what).{0,20}(referr|for)\b|\bpara que es\b|\bshould i (stop|take)\b|\bis (this|it) serious\b/.test(t)) {
      out.intent = 'clinical_question'; return amber('clinical_question', true, 'Patient asked a clinical question.');
    }
    if (/\bnot interested\b|\bno quiero la cita\b|\bno gracias\b/.test(t)) {
      out.intent = 'decline'; out.call_outcome = 'Declined Referral';
      return amber('declined', true, 'Patient declined the appointment.');
    }
    if (/\bwho is this\b|\bquien (es|habla)\b/.test(t)) {
      out.intent = 'who_is_this';
      out.reply_text = es
        ? `Soy el asistente automatizado (IA) de ${input.clinicName}. Queremos hablar con ${input.patientFirstName} sobre una cita. ¿Es usted ${input.patientFirstName}?`
        : `I'm the automated assistant (AI) for ${input.clinicName}. We're trying to reach ${input.patientFirstName} about scheduling an appointment. Is this ${input.patientFirstName}?`;
      return out;
    }
    if (/\b(in|en) (spanish|espanol)\b/.test(t)) { out.language_switch_request = 'es'; out.language = 'es'; }
    if (/\b(in|en) (english|ingles)\b/.test(t)) { out.language_switch_request = 'en'; out.language = 'en'; }

    if (!ctx.identity_verified) {
      const dob = normalizeDob(input.patientMessage);
      if (dob) { out.intent = 'identity_response'; out.identity.dob_candidate = dob; return out; }
      out.reply_text = out.language === 'es'
        ? 'Para proteger su privacidad, por favor responda con su fecha de nacimiento (MM/DD/AAAA).'
        : 'To protect your privacy, please reply with your date of birth (MM/DD/YYYY).';
      return out;
    }

    // Verified: slot pick.
    const slots = ctx.offered_slots;
    let pick: number | null = null;
    for (const [re, i] of ORDINALS) if (re.test(t)) pick = i;
    if (pick === null) {
      const days = DAY_NAMES.filter(([re]) => re.test(t)).map(([, d]) => d);
      if (days.length === 1) {
        const matches = slots.map((s, i) => ({ i, s })).filter(x => dowOf(x.s.start) === days[0]);
        if (matches.length === 1) pick = matches[0].i;
      }
    }
    if (pick !== null && slots[pick]) {
      out.intent = 'slot_selected'; out.use_template = 'slot_captured'; out.call_outcome = 'Appointment Accepted';
      out.captured_slot = { slot_id: slots[pick].slot_id, patient_text: input.patientMessage.slice(0, 200) };
      out.conversation_complete = true;
      return out;
    }
    if (/\bnone\b|\bninguno\b|\bno (me )?sirve\b|\bdont work\b/.test(t)) {
      const more = ctx.more_open_slots ?? [];
      if (more.length) {
        // Suggest other open times, preferring a weekday the patient named.
        const days = DAY_NAMES.filter(([re]) => re.test(t)).map(([, d]) => d);
        const dayOf = (label: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(label.slice(0, 3).toLowerCase());
        const fit = days.length ? more.filter(s => days.includes(dayOf(s.label_en))) : [];
        const pickList = (fit.length ? fit : more).slice(0, 3);
        const es = out.language === 'es';
        out.intent = 'availability_preference';
        out.reply_text = (es ? 'Entiendo. Tambien tenemos:\n' : 'No problem. We also have:\n')
          + pickList.map((s, i) => `${i + 1}) ${es ? s.label_es : s.label_en}`).join('\n')
          + (es ? '\nResponda 1, 2 o 3.' : '\nReply 1, 2 or 3.');
        return out;
      }
      out.intent = 'no_slot_works';
      return amber('no_slot_works', true, 'None of the offered times work for the patient.', null);
    }
    out.intent = 'slot_question';
    out.use_template = 'slot_offer';
    return out;
  }
}

function dowOf(isoWithOffset: string): number {
  // The local weekday is encoded in the label-independent ISO date part (YYYY-MM-DD before 'T').
  const [y, m, d] = isoWithOffset.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ── Bedrock (Converse API) ─────────────────────────────────────────────────

/** Claude Haiku 4.5 via its US inference profile (the newest Claude 5.5 models are blocked on this AWS project until advanced features are on). Override with BEDROCK_MODEL_ID. */
export const DEFAULT_BEDROCK_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

type ConverseMessage = { role: 'user' | 'assistant'; content: { text: string }[] };

/**
 * Strips anything that could look like our own context markers out of patient text.
 * - NFKC first, so look-alike characters (fullwidth ＜ ＞, etc.) become plain ASCII.
 * - Repeats until nothing changes: a single pass can be beaten by nesting
 *   ("<turn_<turn_context>context>" collapses into "<turn_context>").
 * - Finally removes the bare marker word, so no fragment of it reaches the model.
 */
export function sanitizePatientText(s: string): string {
  // Bounded input; every pass that changes something makes the text shorter, so the loop ends.
  let text = s.slice(0, 4000).normalize('NFKC');
  for (;;) {
    const next = text.replace(/<\/?\s*turn_context[^>]*>/gi, '').replace(/turn_context/gi, '');
    if (next === text) break;
    text = next;
  }
  return text.slice(0, 1600);
}

export class BedrockSmsAgentModel implements SmsAgentModel {
  readonly name = 'bedrock' as const;
  private client: Promise<import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient> | null = null;

  private getClient() {
    if (!this.client) {
      this.client = import('@aws-sdk/client-bedrock-runtime').then(
        ({ BedrockRuntimeClient }) => new BedrockRuntimeClient({ region: process.env.AWS_REGION }),
      );
    }
    return this.client;
  }

  async turn(input: ModelInput): Promise<unknown> {
    const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL_ID;
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const client = await this.getClient();

    // History → alternating user/assistant turns (Converse requires a leading user turn).
    const messages: ConverseMessage[] = [];
    const push = (role: 'user' | 'assistant', text: string) => {
      const last = messages[messages.length - 1];
      if (last && last.role === role) last.content.push({ text });
      else messages.push({ role, content: [{ text }] });
    };
    if (input.history[0]?.role === 'assistant') push('user', '[SMS thread started by the clinic]');
    for (const h of input.history) push(h.role, h.role === 'user' ? sanitizePatientText(h.text) : h.text);
    push('user', sanitizePatientText(input.patientMessage) || '(empty message)');
    messages[messages.length - 1].content.push({ text: `<turn_context>${JSON.stringify(input.context)}</turn_context>` });
    if (input.correction) {
      // Written by code, never by the patient: what was wrong with the previous attempt.
      messages[messages.length - 1].content.push({
        text: `Your previous sms_turn output was rejected: ${input.correction}. Call sms_turn again with a corrected output. Aim for 300 characters; reply_text must never exceed 459 characters.`,
      });
    }

    const system = [{ text: buildSystemPrompt(input) }, { text: TURN_CONTEXT_NOTE }];

    // Tool choice: models that accept a forced tool (e.g. Claude Haiku 4.5 / 5.5) are FORCED to
    // call sms_turn. Models that reject forcing with a 400 (Opus 5.5, Sonnet 5.5, Fable) use `auto`,
    // and the system prompt (TURN_CONTEXT_NOTE) requires exactly one sms_turn call. If a model
    // still answers without the tool, we retry ONCE with a reminder; after that the engine fails
    // safe (send nothing + amber agent_error). No temperature / top_p, no assistant prefill, no
    // thinking settings: those are rejected by current models.
    const forced = supportsForcedToolChoice(modelId);
    const send = (msgs: ConverseMessage[]) => client.send(new ConverseCommand({
      modelId,
      system,
      messages: msgs,
      // The command's input types are generated unions; our plain objects match them structurally.
      toolConfig: {
        tools: [{
          toolSpec: {
            name: 'sms_turn',
            description: 'Return the structured result of this SMS turn. Call it exactly once, every turn.',
            inputSchema: { json: SMS_TURN_SCHEMA as unknown as Record<string, unknown> },
          },
        }],
        toolChoice: forced ? { tool: { name: 'sms_turn' } } : { auto: {} },
      } as never,
      inferenceConfig: { maxTokens: 4000 },
    }), { abortSignal: AbortSignal.timeout(25_000) });

    let res = await send(messages);
    let calls = smsTurnCalls(res);
    if (calls.length === 0 && !isFailStop(res.stopReason)) {
      // One retry with an explicit reminder (the patient's text is unchanged).
      const retry = messages.map(m => ({ ...m, content: [...m.content] }));
      retry[retry.length - 1].content.push({ text: RETRY_REMINDER });
      res = await send(retry);
      calls = smsTurnCalls(res);
    }

    // Refusal or truncation → invalid output (the engine fails safe).
    if (isFailStop(res.stopReason)) {
      throw Object.assign(new Error(`model stopped: ${String(res.stopReason)}`), { name: 'ModelStopped' });
    }
    if (calls.length !== 1) throw Object.assign(new Error(`expected one sms_turn call, got ${calls.length}`), { name: 'NoToolUse' });
    return calls[0].toolUse!.input;
  }
}

const RETRY_REMINDER =
  'Reminder: respond ONLY by calling the sms_turn tool exactly once with the full JSON for this turn. Do not answer in plain text.';

type ConverseResult = { stopReason?: string; output?: { message?: { content?: { toolUse?: { name?: string; input?: unknown } }[] } } };

/** Read blocks by type: only toolUse matters; text / reasoning (thinking) blocks are ignored. */
function smsTurnCalls(res: ConverseResult) {
  return (res.output?.message?.content ?? []).filter(b => b.toolUse?.name === 'sms_turn');
}

function isFailStop(stop: unknown): boolean {
  const s = String(stop ?? '');
  return s === 'max_tokens' || s === 'refusal' || s === 'guardrail_intervened' || s === 'content_filtered';
}

/**
 * Whether the Bedrock model accepts a forced tool choice. Opus 5.5, Sonnet 5.5 and Fable models
 * return 400 for a forced tool; Haiku models (4.5, 5.5) accept it. Unknown models default to `auto`.
 */
export function supportsForcedToolChoice(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (/(opus|sonnet)-5-5|fable|mythos/.test(id)) return false;
  return /haiku/.test(id);
}

// ── Selection ───────────────────────────────────────────────────────────────

export function aiProviderName(): 'mock' | 'bedrock' {
  return process.env.AI_PROVIDER?.toLowerCase() === 'bedrock' ? 'bedrock' : 'mock';
}

const g = globalThis as unknown as { __relaySmsModel?: SmsAgentModel };

export function getSmsAgentModel(): SmsAgentModel {
  const want = aiProviderName();
  if (!g.__relaySmsModel || g.__relaySmsModel.name !== want) {
    g.__relaySmsModel = want === 'bedrock' ? new BedrockSmsAgentModel() : new MockSmsAgentModel();
  }
  return g.__relaySmsModel;
}
