// Screens part 3 — Analytics, Alerts, MA action queue, Calendar, Settings, Ingestion.

// ────────── Analytics ──────────

function AnalyticsScreen({ variation, onVariation }) {
  const vars = [
    { value: "hero",   label: "Funnel hero" },
    { value: "grid",   label: "KPI grid" },
  ];
  return (
    <>
      <PageHead title="Analytics" sub="Strategic ROI view · Quarter to date · Apr 1 – Apr 14"
        variation={variation} variations={vars} onVariation={onVariation}
        right={<>
          <button className="btn btn-sm"><Icon name="cal" size={12}/> QTD <Icon name="chevron" size={12}/></button>
          <button className="btn btn-sm"><Icon name="download" size={12}/> Export PDF</button>
        </>}/>
      {variation === "grid" ? <AnalyticsGrid/> : <AnalyticsHero/>}
    </>
  );
}

function AnalyticsHero() {
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Conversion funnel — quarter to date</h3>
            <p className="card-sub">Counts and lift vs. pre-Relay baseline</p>
          </div>
          <span className="pill won bare">+34% lift overall</span>
        </div>
        <Funnel steps={[
          { label: "Referrals received", n: 1284, conv: null },
          { label: "Contacted", n: 1162, conv: 91 },
          { label: "Slot accepted", n: 612, conv: 53 },
          { label: "Confirmed", n: 547, conv: 89 },
          { label: "Visit completed", n: 482, conv: 88 },
        ]}/>
        <div className="text-xs text-3" style={{marginTop:12, display:'flex', gap: 16, flexWrap: 'wrap'}}>
          <span>Baseline (Q1 — pre-Relay): <span className="fw-6 text-2">28% conversion</span></span>
          <span>This quarter: <span className="fw-6" style={{color:'var(--accent-700)'}}>38% conversion</span></span>
          <span>Patients reached who were previously dormant: <span className="fw-6 text-2">203</span></span>
        </div>
      </div>

      <div className="row">
        <div className="card metric" style={{flex: 1, background: 'var(--accent-50)', borderColor: 'var(--accent-200)'}}>
          <div className="metric-label" style={{color: 'var(--accent-700)'}}>Recovered revenue</div>
          <div className="metric-value" style={{fontSize: 36, color: 'var(--accent-800)'}}>$486,200</div>
          <div className="text-xs text-2" style={{marginTop: 4}}>est., based on practice avg. visit value $1,008 × 482 completed</div>
          <div style={{marginTop: 10, display:'flex', gap: 16, flexWrap: 'wrap', fontSize: 12}}>
            <div><div className="text-3 text-xs">From converted referrals</div><div className="fw-6 tnum">$281,400</div></div>
            <div><div className="text-3 text-xs">From backlog re-activation</div><div className="fw-6 tnum">$204,800</div></div>
          </div>
        </div>
        <div className="card" style={{flex: 1}}>
          <div className="card-head">
            <h3>Backlog re-activation — first 14 days</h3>
            <span className="pill won bare">Pilot</span>
          </div>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap: 12}}>
            <MetricMini label="Dead referrals run" value="2,118" sub="from prior 9 months" />
            <MetricMini label="Reached" value="638" sub="30% of pool" />
            <MetricMini label="Slots captured" value="271" sub="42% of reached" />
            <MetricMini label="Visits completed" value="203" sub="$204,800 recovered" />
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card" style={{flex: 1.4}}>
          <div className="card-head">
            <div><h3>Leakage by stage &amp; source</h3><p className="card-sub">Where patients drop, by referring practice</p></div>
            <button className="btn btn-sm btn-ghost"><Icon name="info" size={12}/></button>
          </div>
          <Placeholder label="[ stacked bar chart — leakage by source × stage ]" height={220}/>
          <div className="stack-tight" style={{marginTop: 12, fontSize: 12.5}}>
            <div className="between"><span>Dr. Estrada (PCP)</span><span className="text-3">21% leak at contact stage</span></div>
            <div className="between"><span>SF General — discharge</span><span className="text-3">14% leak at slot stage</span></div>
            <div className="between"><span>Dr. Chen</span><span className="text-3">8% leak at confirm stage</span></div>
          </div>
        </div>
        <div className="card" style={{flex: 1}}>
          <div className="card-head">
            <div>
              <h3>Shadow-calendar fidelity</h3>
              <p className="card-sub">Mirror correctness vs. real schedule · migration readiness</p>
            </div>
            <span className="pill won bare">Healthy</span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap: 20}}>
            <FidelityGauge value={99.4}/>
            <div className="stack-tight" style={{fontSize: 12.5}}>
              <div className="between"><span className="text-3">Mirror writes</span><span className="fw-6">12,418</span></div>
              <div className="between"><span className="text-3">Conflicts detected</span><span className="fw-6">9</span></div>
              <div className="between"><span className="text-3">Resolved in &lt;15 min</span><span className="fw-6">9 / 9</span></div>
              <div className="between"><span className="text-3">Status</span><span style={{color:'var(--accent-700)'}} className="fw-6">Migration-ready</span></div>
            </div>
          </div>
          <Placeholder label="[ 30-day fidelity trend — line ]" height={120}/>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h3>Compliance &amp; audit snapshot</h3><p className="card-sub">Last 30 days · exportable</p></div>
          <button className="btn btn-sm">Download CSV <Icon name="download" size={12}/></button>
        </div>
        <div className="grid" style={{gridTemplateColumns:'repeat(5, 1fr)', gap: 12}}>
          <ComplianceTile label="AI disclosure played" value="100%" sub="11,247 / 11,247"/>
          <ComplianceTile label="Quiet hours respected" value="100%" sub="0 violations"/>
          <ComplianceTile label="Opt-outs honored" value="48 / 48" sub="median 3s"/>
          <ComplianceTile label="PHI on voicemail" value="None" sub="minimum-disclosure rule"/>
          <ComplianceTile label="Change attribution" value="100% logged" sub="immutable trail"/>
        </div>
      </div>
    </div>
  );
}

function ComplianceTile({ label, value, sub }) {
  return (
    <div style={{padding: 12, background:'var(--tint)', borderRadius: 6, border:'1px solid var(--hairline)'}}>
      <div className="text-xs text-3" style={{textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600}}>{label}</div>
      <div className="fw-6 tnum" style={{fontSize: 17, marginTop: 4}}>{value}</div>
      <div className="text-xs text-3">{sub}</div>
    </div>
  );
}

function FidelityGauge({ value }) {
  // simple SVG arc gauge
  const size = 110, stroke = 10;
  const r = (size - stroke) / 2;
  const c = Math.PI * r; // half-circumference
  const dash = (value / 100) * c;
  return (
    <div style={{position:'relative', width: size, height: size / 2 + 12}}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path d={`M${stroke/2},${size/2} A${r},${r} 0 0 1 ${size - stroke/2},${size/2}`}
          fill="none" stroke="var(--ink-5)" strokeWidth={stroke} strokeLinecap="round"/>
        <path d={`M${stroke/2},${size/2} A${r},${r} 0 0 1 ${size - stroke/2},${size/2}`}
          fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}/>
      </svg>
      <div style={{position:'absolute', top: 24, left: 0, right: 0, textAlign:'center'}}>
        <div className="fw-6 tnum" style={{fontSize: 20, letterSpacing: '-0.02em'}}>{value}%</div>
        <div className="text-xs text-3">fidelity</div>
      </div>
    </div>
  );
}

function AnalyticsGrid() {
  return (
    <div className="stack">
      <div className="grid" style={{gridTemplateColumns: 'repeat(4, 1fr)'}}>
        <MetricCard label="Recovered revenue" value="$486k" delta="+$162k vs. baseline" deltaDir="up" spark={[210,260,290,340,360,400,440,486]}/>
        <MetricCard label="Conversion rate" value="38%" delta="+10pp vs. baseline" deltaDir="up" spark={[28,29,31,33,34,35,37,38]}/>
        <MetricCard label="Backlog re-activated" value="203" delta="visits completed" deltaDir="up" spark={[0,8,28,62,108,142,178,203]}/>
        <MetricCard label="Shadow fidelity" value="99.4%" delta="migration-ready" deltaDir="up" spark={[98,98.5,99,99.2,99.3,99.4,99.4,99.4]}/>
      </div>
      <div className="row">
        <div className="card" style={{flex: 1.5}}>
          <div className="card-head"><h3>Conversion funnel · QTD</h3><span className="pill won bare">+34% lift</span></div>
          <Funnel steps={[
            { label: "Received", n: 1284, conv: null },
            { label: "Contacted", n: 1162, conv: 91 },
            { label: "Slot accepted", n: 612, conv: 53 },
            { label: "Confirmed", n: 547, conv: 89 },
            { label: "Completed", n: 482, conv: 88 },
          ]}/>
        </div>
        <div className="card" style={{flex: 1}}>
          <div className="card-head"><h3>Top leakage points</h3></div>
          <div className="stack-tight">
            <LeakBar label="Dr. Estrada — at contact" pct={21}/>
            <LeakBar label="SF Gen — at slot" pct={14}/>
            <LeakBar label="Dr. Chen — at confirm" pct={8}/>
            <LeakBar label="Dr. Brooks — at contact" pct={6}/>
            <LeakBar label="Dr. Lee — at contact" pct={5}/>
          </div>
        </div>
      </div>
      <div className="row">
        <div className="card" style={{flex: 1}}>
          <div className="card-head"><h3>Calls + outcomes · 30d</h3></div>
          <Placeholder label="[ stacked area — connected / vm / no-answer ]" height={180}/>
        </div>
        <div className="card" style={{flex: 1}}>
          <div className="card-head"><h3>Compliance snapshot</h3><button className="btn btn-sm btn-ghost">Export</button></div>
          <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap: 12}}>
            <ComplianceTile label="Disclosure" value="100%" sub="11,247 calls"/>
            <ComplianceTile label="Quiet hrs" value="100%" sub="0 violations"/>
            <ComplianceTile label="Opt-out SLA" value="3s median" sub="48 honored"/>
            <ComplianceTile label="Audit trail" value="100%" sub="immutable"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeakBar({ label, pct }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap: 10, fontSize: 12.5}}>
      <span style={{width: 200, flexShrink:0}} className="text-2">{label}</span>
      <div style={{flex:1, height: 8, background: 'var(--tint)', borderRadius: 4, overflow: 'hidden'}}>
        <div style={{width: `${pct * 3}%`, height: '100%', background: 'var(--urgent)'}}></div>
      </div>
      <span className="tnum fw-6" style={{width: 36, textAlign:'right'}}>{pct}%</span>
    </div>
  );
}

// ────────── Urgent alerts ──────────

function AlertsScreen() {
  const alerts = window.RELAY_DATA.ALERTS;
  return (
    <>
      <PageHead title="Urgent alerts" sub="Escalations needing a human. Reserved warm accent = a human is needed."
        right={<><button className="btn btn-sm btn-ghost">All resolved (12)</button><button className="btn btn-sm">SLA settings</button></>}/>
      <div className="alerts-strip" style={{marginBottom: 16}}>
        <div className="alert-icon"><Icon name="alert" size={16}/></div>
        <div style={{flex:1}}>
          <div className="alert-title">{alerts.filter(a => !a.owner).length} active · {alerts.filter(a => a.owner).length} in progress</div>
          <div className="alert-sub">Median time-to-claim today: 4m 12s · SLA target: 5 min</div>
        </div>
        <button className="btn btn-sm">Filter by reason <Icon name="chevron" size={12}/></button>
      </div>
      <div className="stack">
        {alerts.map(a => (
          <AlertCard key={a.id} a={a}/>
        ))}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding: '12px 0', borderTop:'1px dashed var(--hairline)'}}>
          <span className="text-3 text-sm">Resolved today (3)</span>
          <button className="btn btn-sm btn-ghost">Show <Icon name="chevron" size={12}/></button>
        </div>
      </div>
    </>
  );
}

function AlertCard({ a }) {
  const isClaimed = !!a.owner;
  return (
    <div className="card" style={{
      borderColor: isClaimed ? "var(--hairline)" : "var(--urgent-200)",
      background: isClaimed ? "var(--surface)" : "var(--urgent-50)",
      opacity: isClaimed ? 0.85 : 1,
    }}>
      <div className="between" style={{alignItems:'flex-start', gap: 16}}>
        <div style={{display:'flex', gap: 12}}>
          <div style={{width:36, height:36, borderRadius: 9, background: isClaimed ? 'var(--tint)' : 'var(--urgent-100)', color: 'var(--urgent-700)', display:'grid', placeItems:'center'}}>
            <Icon name="alert" size={16}/>
          </div>
          <div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <div className="fw-6">{a.reason}</div>
              <span className="text-xs text-3">· {a.when}</span>
            </div>
            <div className="text-sm" style={{marginTop: 4}}>
              Patient: <span className="name-link">{a.patient}</span>
              <span className="text-3"> · {a.patientId}</span>
            </div>
            <div className="transcript-summary" style={{marginTop: 10, fontSize: 12.5}}>
              {a.triggerQuote}
            </div>
          </div>
        </div>
        <div style={{display: 'flex', flexDirection:'column', gap: 6, alignItems:'flex-end'}}>
          {isClaimed
            ? <>
                <span className="pill outreach bare">In progress · {a.owner}</span>
                <button className="btn btn-sm">Reassign</button>
                <button className="btn btn-sm btn-ghost">Open</button>
              </>
            : <>
                <button className="btn btn-sm btn-primary"><Icon name="check" size={12}/> I'll take it</button>
                <button className="btn btn-sm">Reassign</button>
                <button className="btn btn-sm btn-ghost">View transcript</button>
              </>}
        </div>
      </div>
    </div>
  );
}

// ────────── MA action queue ──────────

function ActionQueueScreen() {
  const items = window.RELAY_DATA.ACTION_QUEUE;
  return (
    <>
      <PageHead title="Confirm captured slots" sub="The AI captured these slots on calls. Commit them in your practice system, then mark confirmed."
        right={<>
          <span className="tag" style={{background:'var(--accent-50)', borderColor:'var(--accent-200)', color:'var(--accent-800)'}}>
            <Icon name="info" size={11}/>&nbsp;Connector mode · MVP
          </span>
          <button className="btn btn-sm"><Icon name="filter" size={12}/> Filters</button>
        </>}/>
      <div className="alerts-strip calm" style={{marginBottom: 16}}>
        <div className="alert-icon"><Icon name="info" size={14}/></div>
        <div style={{flex:1}}>
          <div className="alert-title">How this works</div>
          <div className="alert-sub">AI captures an accepted slot → it lands here → you confirm in your scheduling system → Relay mirrors it. The richer native approval queue (AI writes directly) lands post-migration.</div>
        </div>
      </div>
      <div className="stack" style={{gap: 14}}>
        {items.map(it => <ConfirmCard key={it.id} it={it}/>)}
      </div>
    </>
  );
}

function ConfirmCard({ it }) {
  const [showTranscript, setShowTranscript] = React.useState(false);
  const [showCal, setShowCal] = React.useState(false);
  return (
    <div className="card">
      <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0, flex: 1}}>
          <Avatar name={it.patient} size="lg"/>
          <div style={{minWidth: 0, flex: 1}}>
            <div style={{display:'flex', gap: 10, alignItems:'baseline', flexWrap:'wrap'}}>
              <div className="fw-6" style={{fontSize: 15}}>{it.patient}</div>
              <span className="text-3 text-xs">{it.age}{it.sex} · {it.lang} · {it.insurance}</span>
              <span className="text-3 text-xs mono">{it.id}</span>
            </div>
            <div className="text-sm text-2" style={{marginTop: 4}}>
              <span className="text-3">Reason:</span> {it.reason} · <span className="text-3">Referred by</span> {it.referredBy}
            </div>
            <div style={{marginTop: 10, display:'flex', gap: 10, alignItems:'center', flexWrap:'wrap'}}>
              <span className="action-slot" style={{fontSize: 13, padding: '6px 12px'}}>
                <Icon name="cal" size={13}/> {it.capturedSlot.date} · {it.capturedSlot.time}
              </span>
              <span className="tag">{it.capturedSlot.provider}</span>
              <span className="tag">{it.capturedSlot.location}</span>
              <PriorityPill priority={it.priority}/>
            </div>
          </div>
        </div>
        <div className="text-xs text-3" style={{whiteSpace:'nowrap'}}>captured {it.capturedAt}</div>
      </div>

      <div className="transcript-summary" style={{marginTop: 14, fontSize: 13}}>
        <span className="fw-6">AI summary · </span>{it.summary}
      </div>

      <div style={{marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
        <button className="btn btn-primary"><Icon name="check" size={13}/> Confirm — booked in practice system</button>
        <button className="btn"><Icon name="edit" size={13}/> Edit slot</button>
        <button className="btn" onClick={() => setShowCal(true)}><Icon name="cal" size={13}/> Preview in calendar</button>
        <button className="btn btn-danger"><Icon name="x" size={13}/> Reject (re-outreach)</button>
        <span style={{flex: 1}}></span>
        <button className={"collapse-toggle" + (showTranscript ? " open" : "")} onClick={() => setShowTranscript(s => !s)}>
          <Icon name="transcript" size={12}/>&nbsp;{showTranscript ? "Hide transcript" : "View transcript"}
          <Icon name="chevron" size={11} className="icon-rot"/>
        </button>
      </div>

      {showTranscript && (
        <div style={{marginTop: 14}}>
          <TranscriptPanel hideAudio data={{
            patient: it.patient,
            call: `Attempt #${it.attempts} · Voice · slot accepted`,
            disclosure: true,
            summary: it.summary,
            turns: window.RELAY_DATA.TRANSCRIPT_SAMPLE.turns,
          }}/>
        </div>
      )}

      {showCal && <CalendarPreviewModal slot={it.capturedSlot} patient={it.patient} onClose={() => setShowCal(false)}/>}
    </div>
  );
}

function CalendarPreviewModal({ slot, patient, onClose }) {
  // Mini week view — preview-only. Locate the proposed slot by parsing its day/time.
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const times = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
  const dayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };
  const slotDay = dayMap[(slot.date || "").split(" ")[0]] ?? 1;
  // parse "2:15pm" / "11:30am"
  const m = /^(\d+):(\d+)(am|pm)$/i.exec(slot.time || "");
  let hr = m ? parseInt(m[1], 10) : 14;
  const ampm = m ? m[3].toLowerCase() : "pm";
  if (ampm === "pm" && hr !== 12) hr += 12;
  if (ampm === "am" && hr === 12) hr = 0;
  // 8AM = row 0 ... 5PM = row 9
  const slotRow = Math.max(0, Math.min(times.length - 1, hr - 8));

  const other = [
    { d: 0, t: 2, lbl: "Helena B." },
    { d: 0, t: 5, lbl: "Marcus B." },
    { d: 1, t: 0, lbl: "Linh P." },
    { d: 2, t: 4, lbl: "Aisha P." },
    { d: 3, t: 7, lbl: "Robert K." },
    { d: 4, t: 1, lbl: "Sofia R." },
  ];

  return (
    <div className="modal-shade" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 style={{margin: 0, fontSize: 15}}>Preview slot in calendar</h3>
            <p className="card-sub">{patient} · {slot.date} · {slot.time} · {slot.provider}</p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={13}/></button>
        </div>
        <div className="modal-body">
          <div className="mini-cal">
            <div className="mc hd"></div>
            {days.map(d => <div key={d} className="mc hd">{d}</div>)}
            {times.map((t, ti) => (
              <React.Fragment key={t}>
                <div className="mc tcol">{t}</div>
                {days.map((_, di) => {
                  const isFocus = di === slotDay;
                  const isNew = di === slotDay && ti === slotRow;
                  const o = other.find(x => x.d === di && x.t === ti);
                  return (
                    <div key={di} className={"mc " + (isFocus ? "focus" : "")}>
                      {o && <div className="mc-appt">{o.lbl}</div>}
                      {isNew && <div className="mc-appt new">{patient.split(" ")[0]}<br/>{slot.time}</div>}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div style={{marginTop: 10, display:'flex', gap: 14, fontSize: 11.5, color: 'var(--ink-3)'}}>
            <span style={{display:'inline-flex', alignItems:'center', gap: 5}}>
              <span style={{width: 10, height: 10, background:'var(--accent)', borderRadius: 2}}></span>Proposed
            </span>
            <span style={{display:'inline-flex', alignItems:'center', gap: 5}}>
              <span style={{width: 10, height: 10, background:'var(--accent-100)', borderRadius: 2, border:'1px solid var(--accent-200)'}}></span>Existing
            </span>
            <span style={{flex: 1}}></span>
            <span style={{color: 'var(--accent-700)'}}>No conflicts · provider available</span>
          </div>
          <div className="divider"></div>
          <div className="between">
            <span className="text-xs text-3">Closing this won't book anything. Confirm above to commit in your practice system.</span>
            <div style={{display: 'flex', gap: 6}}>
              <button className="btn btn-sm" onClick={onClose}>Close</button>
              <button className="btn btn-sm btn-primary" onClick={onClose}><Icon name="check" size={12}/> Confirm slot</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────── Calendar ──────────

function CalendarScreen() {
  const days = ["Mon Apr 14", "Tue Apr 15", "Wed Apr 16", "Thu Apr 17", "Fri Apr 18"];
  const times = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
  const appts = [
    { d: 0, t: 1, who: "Helena Brandt", note: "Pre-op", state: "booked" },
    { d: 0, t: 5, who: "(shadow) Marcus Bell", note: "Tentative", state: "shadow" },
    { d: 1, t: 0, who: "Linh Pham", note: "CHF mgmt", state: "booked" },
    { d: 1, t: 2, who: "Aisha Patel", note: "HTN consult", state: "booked" },
    { d: 1, t: 6, who: "James Okafor", note: "AFib f/u", state: "accepted" },
    { d: 2, t: 3, who: "Robert Klein", note: "Post-MI f/u", state: "accepted" },
    { d: 2, t: 7, who: "Beatriz Coelho", note: "Palpitations", state: "booked" },
    { d: 3, t: 2, who: "(shadow) New referral", note: "Tentative", state: "shadow" },
    { d: 4, t: 1, who: "Sofia Reyes", note: "Screening", state: "booked" },
  ];
  return (
    <>
      <PageHead title="Calendar" sub="Confirmed bookings · shadow mirror entries shown dashed (read-only · MVP)"
        right={<>
          <div className="variations">
            <button className="variation-btn">Day</button>
            <button className="variation-btn active">Week</button>
          </div>
          <button className="btn btn-sm"><Icon name="user" size={12}/> All providers</button>
          <button className="btn btn-sm"><Icon name="map" size={12}/> All locations</button>
        </>}/>
      <div style={{display:'flex', gap: 12, marginBottom: 12, alignItems: 'center', fontSize: 12.5}}>
        <span className="text-3">Apr 14 – 18 · this week</span>
        <span style={{flex:1}}></span>
        <span style={{display:'inline-flex', alignItems:'center', gap: 6}}><span className="cal-appt" style={{margin:0, padding:'2px 8px'}}>Booked</span></span>
        <span style={{display:'inline-flex', alignItems:'center', gap: 6}}><span className="cal-appt shadow" style={{margin:0, padding:'2px 8px'}}>Shadow mirror</span></span>
        <span style={{display:'inline-flex', alignItems:'center', gap: 6}}><span className="pill accepted bare">Awaiting MA</span></span>
      </div>
      <div className="cal-grid">
        <div className="cal-hd"></div>
        {days.map(d => (
          <div key={d} className="cal-hd"><span className="day">{d.split(' ').slice(0,1)} {d.split(' ').slice(1).join(' ')}</span><span>3 booked</span></div>
        ))}
        {times.map((t, ti) => (
          <React.Fragment key={t}>
            <div className="cal-cell timecol">{t}</div>
            {days.map((d, di) => {
              const cellAppts = appts.filter(a => a.d === di && a.t === ti);
              return (
                <div className="cal-cell" key={di}>
                  {cellAppts.map((a, i) => (
                    <div key={i} className={"cal-appt " + (a.state === "shadow" ? "shadow" : "")}
                      style={a.state === "accepted" ? {background:'var(--st-accepted-bg)', borderColor:'var(--st-accepted-fg)', color:'var(--st-accepted-fg)'} : undefined}>
                      <div className="who">{a.who}</div>
                      <div>{a.note}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

// ────────── Settings ──────────

function SettingsScreen() {
  const [section, setSection] = React.useState("cadence");
  const sections = [
    { id: "cadence",   label: "Cadence policy",         icon: "history" },
    { id: "scripts",   label: "AI scripts & disclosure", icon: "transcript" },
    { id: "quiet",     label: "Quiet hours & compliance", icon: "shield" },
    { id: "escalation", label: "Escalation rules",       icon: "alert" },
    { id: "practice",   label: "Practice profile",       icon: "map" },
  ];
  return (
    <>
      <PageHead title="Settings" sub="The supervised-automation story made tangible."
        right={<><button className="btn btn-sm">Audit log</button><button className="btn btn-sm btn-primary">Save</button></>}/>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '0 0 240px', padding: 8 }}>
          {sections.map(s => (
            <button key={s.id} className={"nav-item" + (section === s.id ? " active" : "")} onClick={() => setSection(s.id)}>
              <Icon name={s.icon} size={14}/>
              {s.label}
            </button>
          ))}
        </div>
        <div className="stack" style={{ flex: 1 }}>
          {section === "cadence" && <CadenceSettings/>}
          {section === "scripts" && <ScriptsSettings/>}
          {section === "quiet" && <QuietSettings/>}
          {section === "escalation" && <EscalationSettings/>}
          {section === "practice" && <PracticeSettings/>}
        </div>
      </div>
    </>
  );
}

function SettingRow({ label, sub, control }) {
  return (
    <div style={{display:'flex', alignItems:'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--hairline)'}}>
      <div style={{flex: 1}}>
        <div className="fw-5 text-sm">{label}</div>
        {sub && <div className="text-xs text-3" style={{marginTop: 2}}>{sub}</div>}
      </div>
      <div style={{flex: '0 0 auto'}}>{control}</div>
    </div>
  );
}

function FakeInput({ value, w = 90 }) {
  return <input readOnly value={value} style={{
    background:'var(--surface)', border:'1px solid var(--hairline)', borderRadius: 6,
    padding:'5px 9px', font: 'inherit', fontSize: 13, width: w, color: 'var(--ink)'
  }}/>;
}

function CadenceSettings() {
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Attempt schedule</h3><span className="text-xs text-3">Standard cadence (non-urgent)</span></div>
        <SettingRow label="Voice attempt #1" sub="Within business hours of ingestion" control={<FakeInput value="Same day"/>}/>
        <SettingRow label="Voice attempt #2" sub="Different time-of-day if #1 was no-answer" control={<FakeInput value="Day +2"/>}/>
        <SettingRow label="SMS fallback" sub="After two voicemails / no-answers" control={<FakeInput value="Day +3"/>}/>
        <SettingRow label="Voice attempt #3" sub="" control={<FakeInput value="Day +5"/>}/>
        <SettingRow label="Stop rule" sub="Mark Closed-lost; re-activatable after 60 days"
          control={<FakeInput value="5 attempts" w={110}/>}/>
      </div>
      <div className="card">
        <div className="card-head"><h3>Urgent / high-priority overrides</h3></div>
        <SettingRow label="First attempt SLA" sub="From ingest" control={<FakeInput value="≤ 30 min"/>}/>
        <SettingRow label="Stop rule" sub="" control={<FakeInput value="7 attempts" w={110}/>}/>
        <SettingRow label="Hand to human if no answer in" sub="" control={<FakeInput value="3 attempts" w={110}/>}/>
      </div>
    </>
  );
}

function ScriptsSettings() {
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Mandatory AI disclosure</h3><span className="pill bare lost">Locked · compliance</span></div>
        <div style={{padding: 14, background: 'var(--tint)', border: '1px dashed var(--hairline-strong)', borderRadius: 6, fontSize: 13.5, color: 'var(--ink-2)'}}>
          "Hi, this is the Relay assistant calling on behalf of [practice name]. I'm an AI helping schedule your cardiology referral."
        </div>
        <p className="card-sub" style={{marginTop:10}}>This phrasing is required by policy and cannot be edited inline. Open the compliance request flow to propose changes.</p>
      </div>
      <div className="card">
        <div className="card-head"><h3>Friction-resolution branches</h3><button className="btn btn-sm">Add branch</button></div>
        <div className="stack-tight">
          {["Cost / insurance question", "Why was I referred", "Wrong number / not the patient",
            "Patient distress / clinical question", "Transport / can't get there", "Asks for human"].map((b, i) => (
            <div key={b} style={{display:'flex', alignItems:'center', gap: 10, padding:'10px 0', borderBottom: '1px dashed var(--hairline)'}}>
              <Icon name="transcript" size={14} className=""/>
              <span className="text-sm">{b}</span>
              <span style={{flex:1}}></span>
              <span className="text-xs text-3">Active · 3 variants</span>
              <button className="btn btn-sm btn-ghost"><Icon name="edit" size={12}/></button>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Language variants</h3></div>
        <div style={{display:'flex', gap: 8, flexWrap: 'wrap'}}>
          {["English ✓", "Spanish ✓", "Vietnamese ✓", "Portuguese ✓", "Cantonese", "+ Add"].map(l => (
            <span className="tag" key={l} style={{padding: '4px 10px', fontSize: 12.5}}>{l}</span>
          ))}
        </div>
      </div>
    </>
  );
}

function QuietSettings() {
  return (
    <div className="card">
      <h3>Quiet hours &amp; compliance</h3>
      <SettingRow label="Contact window" sub="Outbound voice + SMS limited to these hours" control={<><FakeInput value="8:00 AM"/> <span style={{margin:'0 8px'}}>–</span> <FakeInput value="8:00 PM"/></>}/>
      <SettingRow label="Sundays" sub="No automated outbound contact" control={<FakeInput value="Disabled"/>}/>
      <SettingRow label="Opt-out keyword" sub="Triggers immediate cadence stop + log" control={<FakeInput value="STOP, QUIT, END"/>}/>
      <SettingRow label="PHI on voicemail" sub="Minimum-disclosure rule — practice + callback number only" control={<FakeInput value="Locked on"/>}/>
      <SettingRow label="Audio retention" sub="" control={<FakeInput value="30 days"/>}/>
      <SettingRow label="Transcript retention" sub="" control={<FakeInput value="2 years"/>}/>
    </div>
  );
}

function EscalationSettings() {
  return (
    <div className="card">
      <h3>What triggers a human</h3>
      <div className="stack-tight" style={{marginTop:8}}>
        {[
          {label:"Clinical / distress signal detected", on: true},
          {label:"Patient explicitly asks for human", on: true},
          {label:"Cost question beyond published estimate", on: true},
          {label:"3 voicemails + 0 SMS engagement", on: true},
          {label:"Wrong number / non-patient on the line", on: true},
          {label:"Cadence exhausted without resolution", on: false},
        ].map((e, i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap: 10, padding: '12px 0', borderBottom:'1px dashed var(--hairline)'}}>
            <Icon name="alert" size={14}/>
            <span className="text-sm">{e.label}</span>
            <span style={{flex:1}}></span>
            <span className={"pill " + (e.on ? "won" : "lost") + " bare"}>{e.on ? "On" : "Off"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PracticeSettings() {
  return (
    <div className="card">
      <h3>Practice profile</h3>
      <div className="grid" style={{gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12}}>
        <div>
          <div className="text-xs text-3">Name</div><FakeInput value="Bay Cardiology Group" w={220}/>
        </div>
        <div>
          <div className="text-xs text-3">Specialty</div><FakeInput value="Cardiology" w={220}/>
        </div>
        <div>
          <div className="text-xs text-3">Locations</div><div style={{display:'flex', gap: 6, marginTop: 4}}><span className="tag">Mission Bay</span><span className="tag">Daly City</span><span className="tag">+ Add</span></div>
        </div>
        <div>
          <div className="text-xs text-3">Providers</div><div style={{display:'flex', gap: 6, marginTop: 4}}><span className="tag">Dr. Park</span><span className="tag">Dr. Aoki</span><span className="tag">Dr. Reyes</span><span className="tag">+ Add</span></div>
        </div>
      </div>
    </div>
  );
}

// ────────── Referral ingestion ──────────

function IngestionScreen() {
  const [parsed, setParsed] = React.useState(true);
  return (
    <>
      <PageHead title="Ingest referrals" sub="Manual upload first · EHR + fax connectors fast-follow"
        right={<><button className="btn btn-sm"><Icon name="history" size={12}/> History</button></>}/>
      <div className="card" style={{
        borderStyle:'dashed', borderColor:'var(--hairline-strong)',
        padding: 28, textAlign:'center', background: 'var(--tint)'
      }}>
        <Icon name="upload" size={24}/>
        <div className="fw-6" style={{marginTop: 6, fontSize: 15}}>Drop a CSV or PDF here</div>
        <div className="text-sm text-3" style={{marginTop: 2}}>Up to 500 rows · we'll parse, validate, and let you review before commit</div>
        <div style={{marginTop: 14, display:'flex', gap: 8, justifyContent:'center'}}>
          <button className="btn btn-primary"><Icon name="upload" size={12}/> Choose file</button>
          <button className="btn">Paste from clipboard</button>
        </div>
      </div>
      {parsed && (
        <div style={{marginTop: 22}}>
          <div className="between" style={{ marginBottom: 10 }}>
            <div>
              <h3 style={{margin:0, fontSize: 15, fontWeight:600}}>Preview · 24 rows parsed</h3>
              <p className="card-sub">21 ready · 3 flagged · review before commit</p>
            </div>
            <div style={{display:'flex', gap: 8}}>
              <button className="btn btn-sm">Fix all flags</button>
              <button className="btn btn-sm btn-primary"><Icon name="check" size={12}/> Import 24 referrals</button>
            </div>
          </div>
          <div style={{background:'var(--surface)', border:'1px solid var(--hairline)', borderRadius: 'var(--radius)', overflow:'hidden'}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th></th><th>Patient</th><th>Phone</th><th>Reason</th><th>Referring</th><th>Lang</th><th>Insurance</th><th>Flags</th>
                </tr>
              </thead>
              <tbody>
                <IngestRow ok name="Eleni Markova" phone="+1 (415) 555-0114" reason="Palpitations" by="Dr. Estrada" lang="English" ins="Aetna"/>
                <IngestRow ok name="Carlos Mendoza" phone="+1 (415) 555-0177" reason="Hypertension" by="Dr. Lee" lang="Spanish" ins="Anthem"/>
                <IngestRow flag="Bad phone" name="Devon Park" phone="+1 (404) 555-OOOO" reason="Stress test" by="Dr. Brooks" lang="English" ins="Cigna"/>
                <IngestRow ok name="Anya Petrov" phone="+1 (415) 555-0199" reason="AFib follow-up" by="Dr. Chen" lang="English" ins="Medicare"/>
                <IngestRow flag="Possible duplicate of R-7818" name="Aisha Patel" phone="+1 (415) 555-0156" reason="HTN consult" by="Dr. Brooks" lang="English" ins="Kaiser"/>
                <IngestRow ok name="Tom Avery" phone="+1 (415) 555-0123" reason="Pre-op clearance" by="Dr. Reyes" lang="English" ins="Aetna"/>
                <IngestRow flag="Missing reason" name="Sun Min Cho" phone="+1 (415) 555-0148" reason="—" by="SF General" lang="Korean" ins="Medicare"/>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function IngestRow({ ok, flag, name, phone, reason, by, lang, ins }) {
  return (
    <tr className={flag ? "row-high" : ""}>
      <td>{ok ? <Icon name="check" size={14}/> : <Icon name="alert" size={14}/>}</td>
      <td className="fw-5">{name}</td>
      <td className="mono text-xs">{phone}</td>
      <td className="text-2">{reason}</td>
      <td className="text-2">{by}</td>
      <td className="text-2">{lang}</td>
      <td className="text-2">{ins}</td>
      <td>
        {flag
          ? <span className="pill escalated bare" style={{fontSize:11}}>{flag}</span>
          : <span className="pill won bare" style={{fontSize:11}}>Ready</span>}
      </td>
    </tr>
  );
}

Object.assign(window, {
  AnalyticsScreen, AlertsScreen, ActionQueueScreen, CalendarScreen,
  SettingsScreen, IngestionScreen,
});
