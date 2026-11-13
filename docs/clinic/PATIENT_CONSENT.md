# Patient Consent for Text Messages

> **Not legal advice — have a lawyer review.** Texting rules come from several places (for example the TCPA, phone carrier rules for 10DLC/toll-free numbers, HIPAA if it applies, and [State] law). Requirements change. A lawyer and the clinician reviewer must approve this wording before it is used with real patients.

**Approved by clinician:** [Name] on [Date]   **Reviewed by lawyer:** [Name] on [Date]

---

## 1. Intake form wording

Add this as its own box on the intake form. Do not pre-check it. Consent must not be required to get care.

### English

> **Appointment text messages (optional)**
>
> [Clinic Name] would like to send text messages to the mobile number above about your referrals and appointments — for example, to help you choose an appointment time and to send reminders.
>
> - Some messages are written by an **automated assistant that uses artificial intelligence (AI)**. Clinic staff review and confirm every appointment.
> - We will **not** send detailed medical information by text.
> - You will get up to **[6] messages per referral**, plus reminders before appointments. *(Message frequency varies.)*
> - **Msg & data rates may apply.**
> - Reply **STOP** to stop texts at any time. Reply **HELP** for help, or call us at **[Clinic phone]**.
> - Saying no will not affect your care.
>
> ☐ **Yes**, you may text me at this number. ☐ **No**, please do not text me.
>
> Mobile number: ____________________   Preferred language: ☐ English ☐ Español ☐ Other: ______
>
> Signature: ____________________   Date: __________

### Español

> **Mensajes de texto sobre citas (opcional)**
>
> [Clinic Name] quisiera enviarle mensajes de texto al número de celular indicado arriba sobre sus referencias y citas; por ejemplo, para ayudarle a elegir el horario de una cita y enviarle recordatorios.
>
> - Algunos mensajes los escribe un **asistente automático que usa inteligencia artificial (IA)**. El personal de la clínica revisa y confirma todas las citas.
> - **No** enviaremos información médica detallada por mensaje de texto.
> - Usted recibirá hasta **[6] mensajes por referencia**, además de recordatorios antes de sus citas. *(La frecuencia de los mensajes puede variar.)*
> - **Pueden aplicarse tarifas por mensajes y datos.**
> - Responda **STOP** (o **ALTO**) en cualquier momento para dejar de recibir mensajes. Responda **HELP** (o **AYUDA**) para obtener ayuda, o llámenos al **[Clinic phone]**.
> - Si dice que no, su atención médica no se verá afectada.
>
> ☐ **Sí**, pueden enviarme mensajes de texto a este número. ☐ **No**, por favor no me envíen mensajes de texto.
>
> Número de celular: ____________________   Idioma preferido: ☐ English ☐ Español ☐ Otro: ______
>
> Firma: ____________________   Fecha: __________

**Check before printing:**
- [ ] Message count `[6]` matches the real limit set in Relay (see `docs/SMS_AGENT_PROMPT.md` / settings).
- [ ] Confirm that Relay and the SMS provider honor **ALTO / AYUDA** as well as STOP / HELP. If not, remove those words from the Spanish version.
- [ ] Clinic phone number is correct.
- [ ] Wording matches the opt-in description given in the SMS number registration (10DLC or toll-free). Carriers may check.

---

## 2. Front desk verbal script

Use this when a patient fills out the form, or when consent is missing.

### English

> "We can send you text messages to help you schedule your referral appointment and remind you about it. Some of the texts come from an automated assistant that uses AI, and our staff confirm every appointment. We won't text detailed medical information. You can reply STOP anytime to stop. Standard message and data rates may apply. Is it OK for us to text you at [read number back]?"

- If **yes**: check "Yes" on the form (or record it — see section 3).
- If **no**: check "No". Say: "No problem. We'll call you instead."
- If they have questions you can't answer: "I'll have [MA name] call you."

### Español

> "Podemos enviarle mensajes de texto para ayudarle a programar su cita de referencia y recordársela. Algunos mensajes los envía un asistente automático que usa inteligencia artificial, y nuestro personal confirma todas las citas. No enviaremos información médica detallada por mensaje de texto. Puede responder STOP en cualquier momento para dejar de recibirlos. Pueden aplicarse tarifas normales de mensajes y datos. ¿Está bien si le enviamos mensajes al [lea el número en voz alta]?"

- Si dice **sí**: marque "Sí" en el formulario (o regístrelo — vea la sección 3).
- Si dice **no**: marque "No". Diga: "No hay problema. Le llamaremos por teléfono."

---

## 3. How to record consent

| Step | What to do |
|---|---|
| 1 | Keep the signed intake form as the clinic normally does (scanned into eCW or filed). |
| 2 | In eCW, record SMS consent: **Yes / No**, date, and language in [the field the clinic chooses — e.g. a patient preference or communication field]. |
| 3 | When a referral is added to Relay, set the patient's channel to SMS **only if consent = Yes**. Otherwise use phone calls by staff. |
| 4 | If the patient gave **verbal** consent, write in eCW: "Verbal SMS consent given [date], script read by [staff name]." |
| 5 | If the patient replies **STOP**, Relay marks them opted out automatically. Also update eCW: "SMS opt-out [date]." Do not text them again unless they opt back in. |
| 6 | If a patient asks to start texts again, they can reply **START**, or staff can record new consent (steps 1–4). |

**Never** text a patient who has not said yes, has opted out, or whose number you are not sure belongs to them.

**Open item:** decide where in eCW consent lives, and who checks it before a referral goes into Relay. Write the answer here: ____________________
