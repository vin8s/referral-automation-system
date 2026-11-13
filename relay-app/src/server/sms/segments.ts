// SMS encoding + segment counting (GSM-7 vs UCS-2). Pure, no I/O.
// Rules from docs/sms-templates.json _meta.counting.

import 'server-only';

// GSM 03.38 basic character set (single septet).
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// Extension table: each costs 2 septets (escape + char).
const GSM_EXT = '^{}\\[~]|€\f';

const BASIC = new Set(Array.from(GSM_BASIC));
const EXT = new Set(Array.from(GSM_EXT));

export type Encoding = 'GSM-7' | 'UCS-2';

export interface SegmentInfo {
  encoding: Encoding;
  /** Septets (GSM-7) or UTF-16 code units (UCS-2). */
  units: number;
  segments: number;
  nonGsmChars: string[];
}

export function measureSms(text: string): SegmentInfo {
  const nonGsm: string[] = [];
  let septets = 0;
  for (const ch of Array.from(text)) {
    if (BASIC.has(ch)) septets += 1;
    else if (EXT.has(ch)) septets += 2;
    else if (!nonGsm.includes(ch)) nonGsm.push(ch);
  }
  if (nonGsm.length === 0) {
    const segments = septets <= 160 ? 1 : Math.ceil(septets / 153);
    return { encoding: 'GSM-7', units: septets, segments, nonGsmChars: [] };
  }
  const units = text.length; // UTF-16 code units (emoji count as 2)
  const segments = units <= 70 ? 1 : Math.ceil(units / 67);
  return { encoding: 'UCS-2', units, segments, nonGsmChars: nonGsm };
}
