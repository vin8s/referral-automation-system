#!/usr/bin/env bash
# Phone test: send real Relay texts to the owner's verified test phone and receive the replies.
#
#   scripts/phone-test/phone-test.sh up                 start server (if needed), reply gate, tunnel, SNS subscription
#   scripts/phone-test/phone-test.sh send [name] [dob]  add a test patient on the test phone and approve the first text
#   scripts/phone-test/phone-test.sh status [REF-id]    show the test conversation
#   scripts/phone-test/phone-test.sh down               remove the SNS subscription, stop the tunnel and gate
#
# Private values (phone, RCS agent, SNS topic) are read from docs/private/AWS_PRIVATE_IDS.md,
# which is git-ignored. Nothing private is stored in this script.
set -euo pipefail

APP="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$(cd "$APP/.." && pwd)"
PRIV="$REPO/docs/private/AWS_PRIVATE_IDS.md"
STATE="$APP/.phone-test"
B="http://localhost:3000"
JAR="$STATE/cookies.txt"
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
AWSP=(--profile relay --region us-east-2)
mkdir -p "$STATE"

die() { echo "phone-test: $*" >&2; exit 1; }
field() { grep -F "$1" "$PRIV" | head -1 | awk -F'|' '{print $3}' | tr -d ' `'; }

load_private() {
  [ -f "$PRIV" ] || die "missing $PRIV (private IDs file)"
  AGENT="$(field 'RCS agent — Rhode Island Free Clinic')"
  TOPIC="$(field 'Inbound SNS topic ARN')"
  PHONE="$(grep -F "Owner's mobile" "$PRIV" | grep -oE '[0-9]{3}-[0-9]{3}-[0-9]{4}' | head -1)"
  [[ "$AGENT" == rcs-* && "$TOPIC" == arn:aws:sns:* && -n "$PHONE" ]] || die "could not read agent/topic/phone from $PRIV"
}

check_aws() {
  aws sts get-caller-identity "${AWSP[@]}" >/dev/null 2>&1 \
    || die "AWS sign-in expired. Run: aws login --profile relay   (then rerun)"
}

listening() { lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

login() { curl -s -o /dev/null -c "$JAR" -H "Origin: $B" -X POST -F "userId=$1" -F next=/ "$B/api/auth/mock-login"; }

start_server() {
  if listening 3000; then echo "server: already running on :3000"; return; fi
  echo "server: starting on :3000 (AWS texting, Bedrock, Eastern time, texts ONLY the test phone)"
  ( cd "$APP" && SMS_ALLOWED_NUMBERS="$PHONE" SMS_TEST_ANY_TIME=on SMS_PROVIDER=aws SMS_ORIGINATION_IDENTITY="$AGENT" SMS_INBOUND_SNS_TOPIC_ARN="$TOPIC" \
      AWS_REGION=us-east-2 AWS_PROFILE=relay AI_PROVIDER=bedrock \
      BEDROCK_MODEL_ID='us.anthropic.claude-haiku-4-5-20251001-v1:0' \
      CLINIC_DISPLAY_NAME='Rhode Island Free Clinic' CLINIC_PHONE_NUMBER='(401) 274-6347' \
      CLINIC_TIMEZONE=America/New_York nohup npm run dev >"$STATE/server.log" 2>&1 & echo $! >"$STATE/server.pid" )
  for _ in $(seq 1 90); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$B/login")" = 200 ] && return; sleep 2; done
  die "server did not start; see $STATE/server.log"
}

check_server_mode() {
  login mock-admin-alex
  local any; any="$(curl -s -b "$JAR" "$B/api/referrals" | python3 -c "import sys,json;d=json.load(sys.stdin);d=d if isinstance(d,list) else next(v for v in d.values() if isinstance(v,list));print(d[0]['id'] if d else '')")"
  [ -n "$any" ] || return 0
  local mode; mode="$(curl -s -b "$JAR" "$B/api/referrals/$any/sms" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('provider'),d.get('aiProvider'))")"
  echo "server: texting=${mode% *} ai=${mode#* }"
  [[ "$mode" == aws* ]] || die "the :3000 server is not in AWS texting mode. Stop it, then rerun 'up' to start it in AWS mode."
  # The server must have been started with the allowlist, so demo patients can never be texted.
  local pid; pid="$(lsof -iTCP:3000 -sTCP:LISTEN -t | head -1)"
  ps eww -p "$pid" 2>/dev/null | grep -q "SMS_ALLOWED_NUMBERS=" \
    || die "the :3000 server was started without SMS_ALLOWED_NUMBERS, so it could text demo patients. Stop it, then rerun 'up'."
  echo "server: texts only the test phone"
}

start_gate() {
  if listening 3200; then echo "gate: already running on :3200"; return; fi
  nohup node "$APP/scripts/phone-test/inbound-gate.mjs" >"$STATE/gate.log" 2>&1 & echo $! >"$STATE/gate.pid"
  sleep 1; listening 3200 || die "gate failed; see $STATE/gate.log"; echo "gate: started on :3200"
}

tunnel_ok() { [ -n "${1:-}" ] && [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -X POST "$1/api/sms/inbound" -d '{}')" = 400 ]; }

start_tunnel() {
  local u; u="$(cat "$STATE/tunnel.url" 2>/dev/null || true)"
  if tunnel_ok "$u"; then echo "tunnel: reusing $u"; TUNNEL="$u"; return; fi
  command -v cloudflared >/dev/null || die "cloudflared not found (brew install cloudflared)"
  [ -f "$STATE/tunnel.pid" ] && kill "$(cat "$STATE/tunnel.pid")" 2>/dev/null || true
  : >"$STATE/tunnel.log"
  nohup cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3200 >"$STATE/tunnel.log" 2>&1 & echo $! >"$STATE/tunnel.pid"
  for _ in $(seq 1 40); do
    u="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$STATE/tunnel.log" | head -1 || true)"
    [ -n "$u" ] && grep -q 'Registered tunnel connection' "$STATE/tunnel.log" && break; sleep 1
  done
  sleep 3; tunnel_ok "$u" || die "tunnel not reachable; see $STATE/tunnel.log"
  echo "$u" >"$STATE/tunnel.url"; TUNNEL="$u"; echo "tunnel: $u"
}

point_sns() {
  local endpoint="$TUNNEL/api/sms/inbound" sub
  # Drop every test-topic HTTPS subscription that is not the current tunnel (old tunnels are dead).
  while read -r arn ep; do
    [ "$arn" = PendingConfirmation ] && continue
    if [ "$ep" != "$endpoint" ]; then aws sns unsubscribe "${AWSP[@]}" --subscription-arn "$arn" && echo "sns: removed old subscription"; else sub="$arn"; fi
  done < <(aws sns list-subscriptions-by-topic "${AWSP[@]}" --topic-arn "$TOPIC" \
             --query "Subscriptions[?Protocol=='https'].[SubscriptionArn,Endpoint]" --output text)
  if [ -z "${sub:-}" ]; then
    sub="$(aws sns subscribe "${AWSP[@]}" --topic-arn "$TOPIC" --protocol https --notification-endpoint "$endpoint" \
             --return-subscription-arn --query SubscriptionArn --output text)"
    sleep 6
  fi
  local pending; pending="$(aws sns get-subscription-attributes "${AWSP[@]}" --subscription-arn "$sub" --query Attributes.PendingConfirmation --output text)"
  [ "$pending" = false ] || die "SNS subscription not confirmed yet (Relay confirms it automatically; rerun 'up' in a minute)"
  echo "$sub" >"$STATE/sns.sub"; echo "sns: replies -> $endpoint (confirmed)"
}

window_note() {
  login mock-admin-alex
  curl -s -b "$JAR" "$B/api/sms/settings" | python3 -c "
import sys,json,datetime,zoneinfo
s=json.load(sys.stdin)['settings']; n=datetime.datetime.now(zoneinfo.ZoneInfo('America/New_York'))
day=(n.weekday()+1)%7; hm=n.strftime('%H:%M')
ok=(not s['textingPaused']) and day in s['allowedDays'] and s['quietStart']<=hm<s['quietEnd']
print('window: OPEN, texts send now' if ok else f\"window: CLOSED (now {n:%a %H:%M} ET; allowed days {s['allowedDays']} {s['quietStart']}-{s['quietEnd']}, paused={s['textingPaused']}). Texts and AI replies wait until it opens.\")"
}

show() {
  local id="${1:-$(cat "$STATE/last.ref" 2>/dev/null || true)}"; [ -n "$id" ] || die "no test referral yet; run 'send'"
  login mock-ma-priya
  echo "== $id"
  curl -s -b "$JAR" "$B/api/referrals/$id/sms" | python3 -c "
import sys,json;d=json.load(sys.stdin)
for m in d['messages']: print(f\"{m['at']:>16}  {'Relay  ' if m['direction']=='outbound' else 'Patient'}  [{m['status']}]  {m['body']}\")
print('(no messages yet)') if not d['messages'] else None"
  curl -s -b "$JAR" "$B/api/referrals" | ID="$id" python3 -c "
import sys,json,os;d=json.load(sys.stdin);d=d if isinstance(d,list) else next(v for v in d.values() if isinstance(v,list))
r=next((x for x in d if x['id']==os.environ['ID']),None)
print('state:',r['state'],'| captured slot:',r.get('capturedSlot') or '-') if r else None"
}

case "${1:-}" in
  up)
    load_private; check_aws; start_server; check_server_mode; start_gate; start_tunnel; point_sns; window_note ;;
  send)
    load_private
    name="${2:-Test $(date +%m%d-%H%M)}"; dob="${3:-03/22/1988}"
    login mock-admin-alex
    body="$(NAME="$name" DOB="$dob" PH="$PHONE" python3 -c "
import json,os;print(json.dumps({'via':'manual','rows':[{'patientName':os.environ['NAME'],'dateOfBirth':os.environ['DOB'],'phone':os.environ['PH'],
'sex':'M','language':'English','insurance':'Uninsured','reason':'Follow-up visit','specialty':'Primary care',
'referringProvider':'Dr. Example','priority':'normal','smsConsent':True,'smsConsentSource':'phone test (owner)'}]}))")"
    curl -s -b "$JAR" -H "Origin: $B" -H 'Content-Type: application/json' -X POST -d "$body" "$B/api/referrals" >/dev/null
    id="$(curl -s -b "$JAR" "$B/api/sms/ready-to-text" | NAME="$name" python3 -c "
import sys,json,os;d=json.load(sys.stdin);print(next((i['referralId'] for i in d['items'] if i['patient']==os.environ['NAME'] and not i['blocked']),''))")"
    [ -n "$id" ] || die "test patient '$name' was not ready to text (check Ready to text on the dashboard)"
    login mock-ma-priya
    curl -s -b "$JAR" -H "Origin: $B" -H 'Content-Type: application/json' -X POST -d "{\"referralIds\":[\"$id\"]}" "$B/api/sms/ready-to-text" >/dev/null
    echo "$id" >"$STATE/last.ref"
    echo "added and approved $id ($name, DOB $dob)"; window_note; sleep 10; show "$id" ;;
  status) show "${2:-}" ;;
  down)
    load_private; check_aws
    if [ -f "$STATE/sns.sub" ]; then aws sns unsubscribe "${AWSP[@]}" --subscription-arn "$(cat "$STATE/sns.sub")" && echo "sns: subscription removed"; rm -f "$STATE/sns.sub"; fi
    for p in tunnel gate; do [ -f "$STATE/$p.pid" ] && kill "$(cat "$STATE/$p.pid")" 2>/dev/null && echo "$p: stopped"; rm -f "$STATE/$p.pid"; done
    rm -f "$STATE/tunnel.url"; echo "server on :3000 left running" ;;
  *) sed -n 2,9p "$0"; exit 1 ;;
esac
