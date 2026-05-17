// Screens part 1 — Dashboard variations.

function UrgentStrip({ count }) {
  if (count === 0) {
    return (
      <div className="alerts-strip calm">
        <div className="alert-icon"><Icon name="check" size={16} /></div>
        <div style={{ flex: 1 }}>
          <div className="alert-title">All clear</div>
          <div className="alert-sub">No escalations or human handoffs pending. The AI is handling the queue.</div>
        </div>
        <button className="btn btn-sm btn-ghost">View history <Icon name="arrow" size={12} /></button>
      </div>);

  }
  return (
    <div className="alerts-strip">
      <div className="alert-icon"><Icon name="alert" size={16} /></div>
      <div style={{ flex: 1 }}>
        <div className="alert-title">{count} escalation{count > 1 ? "s" : ""} need a human now</div>
        <div className="alert-sub">Yuki Tanaka · clinical / distress · 14m ago · 2 more</div>
      </div>
      <button className="btn btn-sm">Open escalation queue <Icon name="arrow" size={12} /></button>
    </div>);

}

function MetricsRow() {
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
      <MetricCard label="Calls made" value="142" delta="+18 vs. typical" deltaDir="up"
      spark={[80, 92, 88, 110, 98, 120, 134, 142]} />
      <MetricCard label="Calls connected" value="61" delta="43% pickup · steady" deltaDir=""
      spark={[40, 42, 48, 50, 55, 58, 56, 61]} />
      <MetricCard label="Slots captured" value="14" delta="+4 vs. typical" deltaDir="up"
      spark={[6, 7, 9, 8, 10, 11, 13, 14]} />
      <MetricCard label="Confirmations done" value="11" delta="3 in queue" deltaDir=""
      spark={[4, 5, 7, 8, 8, 9, 10, 11]} />
      <MetricCard label="No-answers" value="63" delta="↓ 7 vs. typical" deltaDir="down"
      spark={[78, 72, 70, 68, 65, 64, 65, 63]} />
    </div>);

}

function ActionQueueList({ compact }) {
  const items = window.RELAY_DATA.ACTION_QUEUE;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map((it, i) =>
      <div className="action-card" key={it.id}>
          <div className="ac-body" style={{ flex: 1, minWidth: 0 }}>
            <div className="between" style={{ gap: 12, alignItems: 'baseline' }}>
              <div className="fw-6">{it.patient}<span className="text-3 fw-5" style={{ marginLeft: 8, fontWeight: 400 }}>· {it.reason}</span></div>
              <div className="text-xs text-3">captured {it.capturedAt}</div>
            </div>
            <div className="text-xs text-3" style={{ marginTop: 2 }}>
              {it.referredBy} · {it.lang} · {it.insurance}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="action-slot">
                <Icon name="cal" size={12} /> {it.capturedSlot.date} · {it.capturedSlot.time} · {it.capturedSlot.provider}
              </span>
              {!compact &&
            <button className="btn btn-sm btn-ghost"><Icon name="transcript" size={12} /> Transcript</button>
            }
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <button className="btn btn-sm btn-primary"><Icon name="check" size={12} /> Confirm</button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm btn-ghost"><Icon name="edit" size={12} /></button>
              <button className="btn btn-sm btn-ghost"><Icon name="x" size={12} /></button>
            </div>
          </div>
        </div>
      )}
      {items.length === 0 && <EmptyState icon="check" title="Nothing waiting on you" sub="The AI will route confirmations here as patients accept slots." />}
    </div>);

}

function PipelineFunnel() {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Today's referral pipeline</h3>
          <p className="card-sub">Funnel for referrals touched in the last 24h</p>
        </div>
        <button className="btn btn-sm btn-ghost">7-day view <Icon name="chevron" size={12} /></button>
      </div>
      <Funnel steps={[
      { label: "Ingested", n: 38, conv: null },
      { label: "Contacted", n: 27, conv: 71 },
      { label: "Slot accepted", n: 14, conv: 52 },
      { label: "Confirmed", n: 11, conv: 79 },
      { label: "Completed", n: 9, conv: 82 }]
      } />
    </div>);

}

function UpcomingAppointments() {
  const items = [
  { who: "Helena Brandt", when: "Today · 1:30pm", provider: "Dr. Park", state: "booked", lbl: "Pre-op clearance" },
  { who: "Aisha Patel", when: "Tomorrow · 10:00am", provider: "Dr. Park", state: "booked", lbl: "HTN consult" },
  { who: "Robert Klein", when: "Mon · 11:30am", provider: "Dr. Park", state: "accepted", lbl: "Post-MI follow-up" },
  { who: "James Okafor", when: "Tue · 2:15pm", provider: "Dr. Park", state: "accepted", lbl: "AFib follow-up" }];

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Upcoming appointments</h3>
          <p className="card-sub">Confirmed + awaiting MA confirm</p>
        </div>
        <button className="btn btn-sm btn-ghost">Calendar <Icon name="arrow" size={12} /></button>
      </div>
      <div className="stack-tight">
        {items.map((a, i) =>
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < items.length - 1 ? '1px dashed var(--hairline)' : 'none' }}>
            <Avatar name={a.who} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fw-5 text-sm">{a.who}</div>
              <div className="text-xs text-3">{a.lbl} · {a.provider}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-sm">{a.when}</div>
              <div style={{ marginTop: 2 }}><StatePill state={a.state} label={a.state === 'booked' ? 'Booked' : 'Awaiting'} /></div>
            </div>
          </div>
        )}
      </div>
    </div>);

}

function AICheckPanel() {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Is the AI working?</h3>
          <p className="card-sub">Live health signals · last 60 min</p>
        </div>
        <span className="pill won bare">All systems normal</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div className="text-xs text-3">Disclosure played</div>
          <div className="fw-6 text-sm tnum">100% of calls</div>
        </div>
        <div>
          <div className="text-xs text-3">Quiet hours respected</div>
          <div className="fw-6 text-sm tnum">100%</div>
        </div>
        <div>
          <div className="text-xs text-3">Avg time-to-first-attempt</div>
          <div className="fw-6 text-sm tnum">17 min</div>
        </div>
        <div>
          <div className="text-xs text-3">Escalations triggered</div>
          <div className="fw-6 text-sm tnum">1 · within SLA</div>
        </div>
        <div>
          <div className="text-xs text-3">Shadow-calendar fidelity</div>
          <div className="fw-6 text-sm tnum" style={{ color: 'var(--accent-700)' }}>99.4%</div>
        </div>
        <div>
          <div className="text-xs text-3">Opt-outs honored</div>
          <div className="fw-6 text-sm tnum">2 / 2</div>
        </div>
      </div>
    </div>);

}

// ── Dashboard variations ────────────────────────────────────────────────────

function EscalationNotification({ onOpenQueue }) {
  const [open, setOpen] = React.useState(false);
  const alerts = window.RELAY_DATA.ALERTS;
  const active = alerts.filter(a => !a.owner);
  const claimed = alerts.filter(a => a.owner);
  const hasAlerts = active.length > 0;

  React.useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!e.target.closest('.esc-notif')) setOpen(false);
    };
    const tid = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', close); };
  }, [open]);

  return (
    <div className="esc-notif">
      <button className={"esc-btn" + (hasAlerts ? " has-alerts" : "")}
              onClick={() => setOpen(o => !o)}>
        {hasAlerts
          ? <><span className="esc-dot"></span> {active.length} escalation{active.length > 1 ? "s" : ""} need a human</>
          : <><Icon name="check" size={13}/> All clear</>}
        <Icon name="chevron" size={11}/>
      </button>
      {open && (
        <div className="esc-pop" onMouseDown={e => e.stopPropagation()}>
          <div className="esc-pop-head">
            <div>
              <div className="fw-6 text-sm">Escalations</div>
              <div className="text-xs text-3">{active.length} active · {claimed.length} in progress · SLA 5m</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}><Icon name="x" size={12}/></button>
          </div>
          <div className="esc-pop-list">
            {alerts.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                <Icon name="check" size={18}/><div style={{marginTop:6}}>No escalations</div>
              </div>
            )}
            {alerts.map(a => (
              <div className="esc-pop-item" key={a.id}>
                <div style={{display:'flex', gap: 8, alignItems:'center'}}>
                  <span className={"pill bare " + (a.owner ? "outreach" : "escalated")}>{a.reason.split(' /')[0]}</span>
                  <span className="text-xs text-3">· {a.when}</span>
                  <span style={{flex:1}}></span>
                  {a.owner && <span className="text-xs text-3">{a.owner}</span>}
                </div>
                <div className="text-sm" style={{marginTop: 4}}>
                  <span className="name-link">{a.patient}</span>
                  <span className="text-3"> · {a.patientId}</span>
                </div>
                <div className="text-xs text-3" style={{marginTop: 4, fontStyle:'italic', lineHeight:1.4}}>
                  {a.triggerQuote.length > 110 ? a.triggerQuote.slice(0, 110) + "…" : a.triggerQuote}
                </div>
              </div>
            ))}
          </div>
          <div className="esc-pop-foot">
            <button className="btn btn-sm btn-primary" onClick={() => { setOpen(false); onOpenQueue && onOpenQueue(); }}>
              Open escalation queue <Icon name="arrow" size={12}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardActionFirst() {
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 2 }}>
          <div className="card-head">
            <div>
              <h3>Needs your action</h3>
              <p className="card-sub">AI-captured slots awaiting confirmation in your practice system</p>
            </div>
            <span className="pill accepted bare">{window.RELAY_DATA.ACTION_QUEUE.length} pending</span>
          </div>
          <ActionQueueList />
        </div>
        <div className="stack" style={{ flex: 1, gap: 'var(--gap)' }}>
          <AICheckPanel />
          <UpcomingAppointments />
        </div>
      </div>
      <MetricsRow />
      <PipelineFunnel />
    </div>);

}

function DashboardVitalsFirst() {
  const recent = window.RELAY_DATA.REFERRALS.slice(0, 5);
  return (
    <div className="stack">

      {/* Today's call activity — slim, top */}
      <div className="card" style={{ padding: '12px 18px' }}>
        <div className="between" style={{ marginBottom: 8, alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 13 }}>
            Today's call activity
            <span className="text-xs text-3 fw-5" style={{ marginLeft: 8, fontWeight: 400 }}>last 24h · vs. typical day</span>
          </h3>
          <button className="btn btn-sm btn-ghost">7-day <Icon name="chevron" size={12} /></button>
        </div>
        <div className="ai-stats">
          <CompactStat label="Calls made" value="142" delta="+18" dir="up" />
          <CompactStat label="Connected" value="61" delta="43% pickup" />
          <CompactStat label="Slots captured" value="14" delta="+4" dir="up" />
          <CompactStat label="Confirmations" value="11" delta="3 in queue" />
          <CompactStat label="No-answers" value="63" delta="−7" dir="down" />
        </div>
      </div>

      {/* Action queue (2/3) + Pipeline glance (1/3) */}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 2 }}>
          <div className="card-head">
            <div>
              <h3>Needs your action</h3>
              <p className="card-sub">AI-captured slots awaiting confirmation in your practice system</p>
            </div>
            <span className="pill accepted bare">{window.RELAY_DATA.ACTION_QUEUE.length} pending</span>
          </div>
          <ActionQueueList compact />
        </div>
        <PipelineGlance />
      </div>

      {/* Recent referrals — 5 most recent */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-head" style={{ padding: '14px 16px 12px', marginBottom: 0, borderBottom: '1px solid var(--hairline)' }}>
          <div>
            <h3>Recent referrals</h3>
            <p className="card-sub">5 most recent · newest first</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <window.PriorityLegend />
            <button className="btn btn-sm btn-ghost">View all <Icon name="arrow" size={11} /></button>
          </div>
        </div>
        <DashboardReferralsTable rows={recent} />
      </div>

      {/* Bottom row: AI working signals (left) + Calendar mini (right) */}
      <div className="row">
        <AICheckPanel />
        <CalendarMini />
      </div>
    </div>);

}

function PipelineGlance() {
  const states = [
  { id: "queued", label: "Queued", count: 4 },
  { id: "outreach", label: "Outreach", count: 18 },
  { id: "accepted", label: "Slot accepted", count: 2 },
  { id: "booked", label: "Booked", count: 9 },
  { id: "escalated", label: "Escalated", count: 1 },
  { id: "won", label: "Closed-won", count: 4 }];

  const max = Math.max(...states.map((s) => s.count));
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-head">
        <div>
          <h3>Pipeline at a glance</h3>
          <p className="card-sub">38 referrals in motion</p>
        </div>
      </div>
      <div className="stack-tight" style={{ gap: 9 }}>
        {states.map((s) =>
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 110, flexShrink: 0 }}><StatePill state={s.id} label={s.label} /></span>
            <div style={{ flex: 1, height: 6, background: 'var(--tint)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${s.count / max * 100}%`, height: '100%', background: `var(--st-${s.id}-fg)`, opacity: 0.55 }}></div>
            </div>
            <span className="tnum fw-6" style={{ width: 24, textAlign: 'right', fontSize: 13 }}>{s.count}</span>
          </div>
        )}
      </div>
    </div>);

}

function CalendarMini() {
  const days = ["Mon 14", "Tue 15", "Wed 16", "Thu 17", "Fri 18"];
  const times = ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"];
  const appts = [
  { d: 0, t: 0, who: "Linh P.", state: "booked" },
  { d: 0, t: 4, who: "Helena B.", state: "booked" },
  { d: 1, t: 1, who: "Aisha P.", state: "booked" },
  { d: 1, t: 5, who: "James O.", state: "accepted" },
  { d: 2, t: 2, who: "Robert K.", state: "accepted" },
  { d: 2, t: 6, who: "Beatriz C.", state: "booked" },
  { d: 4, t: 0, who: "Sofia R.", state: "booked" }];

  return (
    <div className="card" style={{ flex: 1.4 }}>
      <div className="card-head" style={{ marginBottom: 10 }}>
        <div>
          <h3>This week's schedule</h3>
          <p className="card-sub">Apr 14 – 18 · confirmed + awaiting MA</p>
        </div>
        <button className="btn btn-sm btn-ghost">Calendar <Icon name="arrow" size={11} /></button>
      </div>
      <div className="mini-cal" style={{ gridTemplateColumns: '38px repeat(5, 1fr)' }}>
        <div className="mc hd"></div>
        {days.map((d) => <div key={d} className="mc hd">{d}</div>)}
        {times.map((t, ti) =>
        <React.Fragment key={t}>
            <div className="mc tcol">{t}</div>
            {days.map((_, di) => {
            const a = appts.find((x) => x.d === di && x.t === ti);
            return (
              <div key={di} className="mc">
                  {a && <div className="mc-appt"
                style={a.state === "accepted" ? { background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)', borderColor: 'var(--st-accepted-fg)' } : undefined}>
                    {a.who}
                  </div>}
                </div>);

          })}
          </React.Fragment>
        )}
      </div>
      <div className="text-xs text-3" style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: 'var(--accent-100)', border: '1px solid var(--accent-200)', borderRadius: 2 }}></span>Booked
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: 'var(--st-accepted-bg)', border: '1px solid var(--st-accepted-fg)', borderRadius: 2 }}></span>Awaiting MA
        </span>
      </div>
    </div>);

}

function CompactStat({ label, value, delta, dir }) {
  const cls = dir === "up" ? "delta-up" : dir === "down" ? "delta-down" : "text-3";
  return (
    <div className="ai-stat">
      <div className="text-xs text-3" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, fontSize: 10 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 17, fontWeight: 600, marginTop: 1, letterSpacing: '-0.01em' }}>{value}
        <span className={"text-xs " + cls} style={{ marginLeft: 6, fontWeight: 500 }}>{delta}</span>
      </div>
    </div>);

}

function DashboardReferralsTable({ rows }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Patient</th>
          <th>Reason</th>
          <th>Referring</th>
          <th>Referred</th>
          <th>State</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) =>
        <tr key={r.id} className={"row-clickable " + window.priClass(r.priority)} title={`${r.priority} priority`}>
            <td>
              <div className="fw-5">{r.patient}</div>
              <div className="text-xs text-3">{r.age}{r.sex} · {r.id}</div>
            </td>
            <td className="text-2">{r.reason}</td>
            <td className="text-2 text-xs">{r.referredBy}</td>
            <td className="text-2 text-xs mono">{r.referredAt}</td>
            <td><window.StateDropdown state={r.state} label={r.stateLabel} /></td>
            <td><button className="btn btn-sm btn-ghost"><Icon name="arrow" size={12} /></button></td>
          </tr>
        )}
      </tbody>
    </table>);

}

function DashboardSplitRhythm() {
  // Two distinct halves: "what needs me" (left, action) and "is the AI working" (right, vitals)
  return (
    <div className="stack">
      <div className="row">
        <div className="stack" style={{ flex: 1.6, gap: 'var(--gap)' }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>What needs me</h3>
                <p className="card-sub">Your action queue, in priority order</p>
              </div>
              <span className="pill accepted bare">{window.RELAY_DATA.ACTION_QUEUE.length} now</span>
            </div>
            <ActionQueueList />
          </div>
          <PipelineFunnel />
        </div>
        <div className="stack" style={{ flex: 1, gap: 'var(--gap)' }}>
          <div className="card">
            <div className="card-head">
              <h3>Is the AI working</h3>
              <span className="pill won bare">Healthy</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <MetricMini label="Calls today" value="142" sub="+18 vs. typical" />
              <MetricMini label="Pickup rate" value="43%" sub="steady" />
              <MetricMini label="Slots captured" value="14" sub="+4 vs. typical" />
              <MetricMini label="Confirmations" value="11" sub="3 in queue" />
            </div>
            <div className="divider"></div>
            <div className="stack-tight" style={{ fontSize: 13 }}>
              <div className="between"><span className="text-3">Disclosure played</span><span className="fw-6">100%</span></div>
              <div className="between"><span className="text-3">Quiet hours respected</span><span className="fw-6">100%</span></div>
              <div className="between"><span className="text-3">Shadow-calendar fidelity</span><span className="fw-6" style={{ color: 'var(--accent-700)' }}>99.4%</span></div>
              <div className="between"><span className="text-3">Avg time-to-first-attempt</span><span className="fw-6">17 min</span></div>
            </div>
          </div>
          <UpcomingAppointments />
        </div>
      </div>
    </div>);

}

function MetricMini({ label, value, sub }) {
  return (
    <div>
      <div className="text-xs text-3" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 600, marginTop: 2, letterSpacing: '-0.02em' }}>{value}</div>
      <div className="text-xs text-3">{sub}</div>
    </div>);

}

function DashboardScreen({ variation, onVariation, onNavigate }) {
  const vars = [
  { value: "action", label: "Action-first" },
  { value: "vitals", label: "Vitals-first" },
  { value: "split", label: "Split rhythm" }];

  let body;
  if (variation === "vitals") body = <DashboardVitalsFirst />;else
  if (variation === "split") body = <DashboardSplitRhythm />;else
  body = <DashboardActionFirst />;
  return (
    <>
      <PageHead
        title="Good morning, Priya"
        sub="Today is Apr 14 · 38 referrals in motion"
        variation={variation} variations={vars} onVariation={onVariation}
        right={<>
          <EscalationNotification onOpenQueue={() => onNavigate && onNavigate("alerts")}/>
          <button className="btn btn-sm btn-ghost"><Icon name="refresh" size={13} /></button>
          <button className="btn btn-sm">Today <Icon name="chevron" size={12} /></button>
        </>} />
      
      {body}
    </>);

}

Object.assign(window, {
  DashboardScreen, UrgentStrip, ActionQueueList, PipelineFunnel,
  UpcomingAppointments, AICheckPanel, MetricsRow, MetricMini,
  CompactStat, DashboardReferralsTable, PipelineGlance, CalendarMini,
  EscalationNotification
});