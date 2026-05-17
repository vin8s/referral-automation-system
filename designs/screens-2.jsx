// Screens part 2 — Referral list, Referral detail, AI call log.

// Helpers
function StateLabel({ state }) {
  const map = {
    ingested: "Ingested", queued: "Queued", outreach: "Outreach active",
    accepted: "Slot accepted", booked: "Booked", escalated: "Escalated",
    lost: "Closed-lost", won: "Closed-won",
  };
  return <StatePill state={state} label={map[state] || state} />;
}

function PriorityPill({ priority }) {
  const cls = priority === "Urgent" ? "high" : priority === "High" ? "high" : "lost";
  return <span className={"pill " + cls + " bare"}>{priority}</span>;
}

// Priority → left-border row class
function priClass(p) {
  if (p === "Urgent") return "pri-urgent";
  if (p === "High")   return "pri-high";
  return "pri-routine";
}

function PriorityLegend() {
  return (
    <span className="pri-legend" title="Priority is shown as a colored bar at the left of each row. Red = urgent, amber = high, no bar = routine.">
      <span className="swatch" style={{background:'#dc2626'}}></span><span style={{marginRight: 6}}>Urgent</span>
      <span className="swatch" style={{background:'var(--urgent)'}}></span><span style={{marginRight: 6}}>High</span>
      <span className="swatch" style={{background:'transparent', border:'1px dashed var(--ink-5)'}}></span>Routine
    </span>
  );
}

// State dropdown — click pill, pick a new state. MA can override; AI also writes here.
function StateDropdown({ state, label, onChange, attribution }) {
  const [open, setOpen] = React.useState(false);
  const STATES = [
    { id: "ingested",  label: "Ingested",          attr: "system" },
    { id: "queued",    label: "Queued",            attr: "system" },
    { id: "outreach",  label: "Outreach active",   attr: "AI" },
    { id: "accepted",  label: "Slot accepted",     attr: "AI captured" },
    { id: "booked",    label: "Booked",            attr: "MA" },
    { id: "escalated", label: "Escalated",         attr: "AI raised" },
    { id: "won",       label: "Closed-won",        attr: "completed" },
    { id: "lost",      label: "Closed-lost",       attr: "MA / cadence" },
  ];
  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const tid = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => { clearTimeout(tid); document.removeEventListener("mousedown", close); };
  }, [open]);
  const curr = STATES.find(s => s.id === state);
  return (
    <span className="state-dd" onClick={e => e.stopPropagation()}>
      <span className="state-dd-trigger" onMouseDown={e => { e.stopPropagation(); setOpen(o => !o); }}
            title={attribution || (curr ? `Set by ${curr.attr}` : "Set state")}>
        <StatePill state={state} label={label || (curr && curr.label) || state}/>
        <Icon name="chevron" size={11} className="chev"/>
      </span>
      {open && (
        <div className="state-dd-menu" onMouseDown={e => e.stopPropagation()}>
          <div className="hdr">Update state · audited</div>
          {STATES.map(s => (
            <div key={s.id} className={"state-dd-item " + (s.id === state ? "curr" : "")}
                 onClick={() => { onChange && onChange(s.id); setOpen(false); }}>
              <StatePill state={s.id} label={s.label}/>
              <span className="attr">{s.attr}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// ────────── Referral list ──────────

function FilterBar({ stateFilter, setStateFilter, search, setSearch, urgentOnly, setUrgentOnly }) {
  const states = ["all", "outreach", "accepted", "booked", "queued", "escalated", "ingested", "won", "lost"];
  const labels = {
    all: "All", outreach: "Outreach active", accepted: "Slot accepted",
    booked: "Booked", queued: "Queued", escalated: "Escalated",
    ingested: "Ingested", won: "Closed-won", lost: "Closed-lost",
  };
  return (
    <div className="filterbar">
      <div className="filter-search">
        <Icon name="search" size={14}/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient, reason, provider…" />
      </div>
      {states.slice(0, 5).map(s => (
        <button key={s} className={"chip" + (stateFilter === s ? " active" : "")}
          onClick={() => setStateFilter(s)}>{labels[s]}</button>
      ))}
      <span className="text-3 text-xs" style={{margin:'0 4px'}}>·</span>
      <button className={"chip" + (urgentOnly ? " chip-urgent active" : "")} onClick={() => setUrgentOnly(!urgentOnly)}>
        <Icon name="alert" size={11}/> Urgent only
      </button>
      <span style={{flex: 1}}></span>
      <button className="chip"><Icon name="filter" size={11}/> More filters</button>
      <button className="chip"><Icon name="download" size={11}/> Export</button>
    </div>
  );
}

function ReferralListTable({ rows, onOpen }) {
  const [sort, setSort] = React.useState({ col: "referredAt", dir: "desc" });

  const sortedRows = React.useMemo(() => {
    const arr = [...rows];
    const c = sort.col;
    const stateOrder = ["escalated","accepted","outreach","queued","ingested","booked","won","lost"];
    arr.sort((a, b) => {
      let av, bv;
      if (c === "referredAt") {
        // ids encode arrival order; higher id = newer
        av = a.id; bv = b.id;
      } else if (c === "state") {
        av = stateOrder.indexOf(a.state); bv = stateOrder.indexOf(b.state);
      } else if (c === "attempts") {
        av = a.attempts; bv = b.attempts;
      } else {
        av = (a[c] || "").toString().toLowerCase();
        bv = (b[c] || "").toString().toLowerCase();
      }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sort]);

  const onSort = (col) => {
    setSort(s => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  };

  const SortableTh = ({ col, children }) => {
    const on = sort.col === col;
    return (
      <th className={"sortable" + (on ? " sort-on" : "") + (on && sort.dir === "asc" ? " sort-asc" : "")}
          onClick={() => onSort(col)}>
        {children}
        <span className="sort-ind"><Icon name="chevron" size={10}/></span>
      </th>
    );
  };

  return (
    <div style={{background:'var(--surface)', border:'1px solid var(--hairline)', borderTop:0, borderRadius:'0 0 var(--radius) var(--radius)', overflow:'hidden'}}>
      <table className="tbl">
        <thead>
          <tr>
            <SortableTh col="patient">Patient</SortableTh>
            <SortableTh col="referredBy">Referring provider</SortableTh>
            <SortableTh col="referredAt">Referred</SortableTh>
            <SortableTh col="state">State</SortableTh>
            <SortableTh col="lang">Lang</SortableTh>
            <SortableTh col="insurance">Insurance</SortableTh>
            <th>Last summary</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(r => (
            <tr key={r.id}
                className={"row-clickable " + priClass(r.priority)}
                onClick={() => onOpen(r)}
                title={`${r.priority} priority`}>
              <td>
                <div className="fw-5">{r.patient}
                  {r.badPhone && <span className="tag" style={{marginLeft:6, background:'var(--urgent-50)', color:'var(--urgent-700)', borderColor:'var(--urgent-200)'}}>bad phone</span>}
                </div>
                <div className="text-xs text-3">{r.age}{r.sex} · {r.id}</div>
              </td>
              <td className="text-2 text-xs">{r.referredBy}</td>
              <td className="text-2 text-xs mono">{r.referredAt}</td>
              <td><StateDropdown state={r.state} label={r.stateLabel} attribution={`Set by ${r.state === 'accepted' ? 'AI' : r.state === 'booked' ? 'MA' : 'system'}`}/></td>
              <td className="text-2">{r.lang}</td>
              <td className="text-2">{r.insurance}</td>
              <td className="text-3 text-xs" style={{maxWidth: 320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.summary}</td>
              <td><button className="btn btn-sm btn-ghost"><Icon name="arrow" size={12}/></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {sortedRows.length === 0 && <EmptyState title="No referrals match" sub="Try clearing filters or adjust the search." />}
    </div>
  );
}

function ReferralListCards({ rows, onOpen }) {
  return (
    <div className="grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12, marginTop: 0,
      background:'var(--surface)', border:'1px solid var(--hairline)', borderTop:0, borderRadius:'0 0 var(--radius) var(--radius)', padding: 14}}>
      {rows.map(r => (
        <div key={r.id} className={"action-card " + (r.priority === "Urgent" ? "" : "")}
          onClick={() => onOpen(r)} style={{cursor:'pointer', borderColor: r.priority === "Urgent" ? "var(--urgent-200)" : undefined}}>
          <Avatar name={r.patient}/>
          <div style={{flex:1, minWidth:0}}>
            <div className="between" style={{gap: 8, alignItems:'baseline'}}>
              <div className="fw-6">{r.patient}</div>
              <div className="text-xs text-3">{r.id}</div>
            </div>
            <div className="text-xs text-3">{r.reason} · {r.referredBy}</div>
            <div style={{ marginTop: 8, display:'flex', gap: 6, flexWrap: 'wrap' }}>
              <StateLabel state={r.state}/>
              <PriorityPill priority={r.priority}/>
              <span className="tag">{r.lang}</span>
              <span className="tag">#{r.attempts} attempts</span>
            </div>
            <div className="text-xs text-3" style={{marginTop: 8, lineHeight: 1.4}}>{r.summary}</div>
            <div className="text-xs" style={{marginTop:8, color:'var(--accent-700)', display:'flex', alignItems:'center', gap: 4}}>
              <Icon name="cal" size={11}/> Next: {r.nextAction}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReferralListScreen({ variation, onVariation, onOpenReferral }) {
  const [stateFilter, setStateFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [urgentOnly, setUrgentOnly] = React.useState(false);

  const filtered = window.RELAY_DATA.REFERRALS.filter(r => {
    if (stateFilter !== "all" && r.state !== stateFilter) return false;
    if (urgentOnly && r.priority !== "Urgent") return false;
    if (search && !(r.patient + " " + r.reason + " " + r.referredBy).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const vars = [
    { value: "table", label: "Dense table" },
    { value: "cards", label: "Card mode" },
  ];

  return (
    <>
      <PageHead title="Referrals" sub={`${filtered.length} of ${window.RELAY_DATA.REFERRALS.length} · 9 in motion · 2 awaiting you`}
        variation={variation} variations={vars} onVariation={onVariation}
        right={<>
          <PriorityLegend/>
          <button className="btn btn-sm"><Icon name="upload" size={12}/> Ingest</button>
          <button className="btn btn-sm btn-primary"><Icon name="plus" size={12}/> New referral</button>
        </>} />
      <FilterBar
        stateFilter={stateFilter} setStateFilter={setStateFilter}
        search={search} setSearch={setSearch}
        urgentOnly={urgentOnly} setUrgentOnly={setUrgentOnly} />
      {variation === "cards"
        ? <ReferralListCards rows={filtered} onOpen={onOpenReferral} />
        : <ReferralListTable rows={filtered} onOpen={onOpenReferral} />}
    </>
  );
}

// ────────── Referral detail ──────────

function ReferralDetailScreen({ referral, variation, onVariation, onBack }) {
  const r = referral || window.RELAY_DATA.REFERRALS.find(x => x.id === "R-7821");
  const vars = [
    { value: "two-col", label: "Two-column" },
    { value: "timeline", label: "Timeline-first" },
  ];

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>
          <Icon name="arrow" size={12} className="" /> <span style={{transform:'rotate(180deg)', display:'inline-block'}}>→</span> Referrals
        </button>
        <span className="text-3 text-xs mono">{r.id}</span>
      </div>
      <div className="pg-head" style={{ marginBottom: 22, alignItems: 'flex-start' }}>
        <div style={{display:'flex', gap: 14, alignItems:'center'}}>
          <Avatar name={r.patient} size="lg"/>
          <div>
            <h1 style={{fontSize: 22}}>{r.patient}</h1>
            <div className="sub" style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              {r.age}{r.sex} · {r.lang} · {r.insurance} · {r.location}
              <StateLabel state={r.state}/>
              <PriorityPill priority={r.priority}/>
            </div>
          </div>
        </div>
        <div className="right">
          <Variations options={vars} value={variation} onChange={onVariation}/>
          <button className="btn btn-sm"><Icon name="pause" size={12}/> Pause cadence</button>
          <button className="btn btn-sm btn-danger"><Icon name="flag" size={12}/> Escalate</button>
          <button className="btn btn-sm btn-primary"><Icon name="check" size={12}/> Confirm slot</button>
        </div>
      </div>
      {variation === "timeline" ? <DetailTimelineFirst r={r}/> : <DetailTwoCol r={r}/>}
    </>
  );
}

function PatientFacts({ r }) {
  return (
    <div className="card">
      <h3>Patient &amp; insurance</h3>
      <div className="stack-tight" style={{ fontSize: 13, marginTop: 6 }}>
        <Fact label="Name" value={r.patient}/>
        <Fact label="DOB / age" value={`(${r.age} ${r.sex === 'F' ? 'female' : 'male'})`}/>
        <Fact label="Phone" value={<span className="mono">+1 (415) 555-0188</span>}/>
        <Fact label="Preferred lang" value={r.lang}/>
        <Fact label="Insurance" value={r.insurance}/>
        <Fact label="Network" value="In-network"/>
        <Fact label="Location pref" value={r.location}/>
      </div>
      <div className="divider"></div>
      <h3>Referral facts</h3>
      <div className="stack-tight" style={{ fontSize: 13, marginTop: 6 }}>
        <Fact label="Reason" value={r.reason}/>
        <Fact label="Referring provider" value={r.referredBy}/>
        <Fact label="Referred at" value={r.referredAt}/>
        <Fact label="Urgency" value={<PriorityPill priority={r.priority}/>}/>
        <Fact label="Attempts" value={`${r.attempts} (voice + SMS)`}/>
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div style={{display:'flex', alignItems:'baseline', gap: 12}}>
      <span className="text-3 text-xs" style={{ width: 130, flexShrink: 0 }}>{label}</span>
      <span className="text-2">{value}</span>
    </div>
  );
}

function NextActionCard({ r }) {
  return (
    <div className="card" style={{ background: 'var(--accent-50)', borderColor: 'var(--accent-200)' }}>
      <div className="between">
        <div>
          <div className="text-xs" style={{textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600, color:'var(--accent-700)'}}>Next scheduled action</div>
          <div className="fw-6" style={{marginTop:4, fontSize: 14}}>{r.nextAction}</div>
        </div>
        <div style={{display:'flex', gap: 6}}>
          <button className="btn btn-sm">Edit cadence</button>
          <button className="btn btn-sm btn-ghost"><Icon name="pause" size={12}/></button>
        </div>
      </div>
    </div>
  );
}

function ActivityTimeline({ r, dense }) {
  const events = [
    { t: "Apr 14 · 09:12", title: "Referral ingested", meta: `Source: ${r.referredBy} · phone validated · dedupe pass`, done: true },
    { t: "Apr 14 · 09:14", title: "Cadence scheduled", meta: "First attempt: today 10:00 AM · respecting quiet hours", done: true },
    { t: "Apr 14 · 10:01", title: "Voice attempt #1 — voicemail", meta: "Left compliant minimal-PHI message · SMS fallback queued", done: true },
    { t: "Apr 14 · 10:02", title: "SMS sent", meta: "Callback link delivered · opened 11 min later · no reply", done: true },
    { t: "Apr 14 · 10:48", title: "Voice attempt #2 — connected", meta: "4m 12s · friction: cost · resolved · patient will call back 6:30pm", done: true, hasTranscript: true },
    { t: "Apr 14 · 18:30", title: "Scheduled: voice attempt #3", meta: "Patient-initiated callback window", done: false },
  ];
  return (
    <div className="card">
      <div className="card-head"><h3>Activity timeline</h3>{!dense && <button className="btn btn-sm btn-ghost">Export <Icon name="download" size={11}/></button>}</div>
      <div className="tl">
        {events.map((e, i) => (
          <div className="tl-item" key={i}>
            <div className={"tl-marker " + (e.done ? "done" : "")}>
              <div className="dot"></div>
              <div className="line"></div>
            </div>
            <div className="tl-body">
              <div className="tl-title">{e.title}</div>
              <div className="tl-meta">{e.t} · {e.meta}</div>
              {e.hasTranscript && !dense && (
                <div style={{marginTop:10}}>
                  <TranscriptPanel compact />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTwoCol({ r }) {
  return (
    <div className="row">
      <div className="stack" style={{flex: 1}}>
        <PatientFacts r={r}/>
        <NextActionCard r={r}/>
      </div>
      <div className="stack" style={{flex: 1.6}}>
        <ActivityTimeline r={r}/>
        <div className="card">
          <div className="card-head">
            <h3>Most recent call · attempt #2</h3>
            <button className="btn btn-sm btn-ghost">All calls (4) →</button>
          </div>
          <TranscriptPanel />
        </div>
      </div>
    </div>
  );
}

function DetailTimelineFirst({ r }) {
  return (
    <div className="row">
      <div className="stack" style={{flex: 2}}>
        <NextActionCard r={r}/>
        <ActivityTimeline r={r}/>
      </div>
      <div className="stack" style={{flex: 1}}>
        <PatientFacts r={r}/>
        <div className="card">
          <div className="card-head"><h3>Audit attribution</h3></div>
          <div className="stack-tight" style={{fontSize: 12.5}}>
            <div className="between"><span className="text-3">Created by</span><span>System · referral ingest</span></div>
            <div className="between"><span className="text-3">Last touched</span><span>AI agent · 14 min ago</span></div>
            <div className="between"><span className="text-3">Will be confirmed by</span><span className="show-ma">Priya (you)</span><span className="show-coord">Denise C.</span><span className="show-admin">MA team</span></div>
            <div className="between"><span className="text-3">Mirror status</span><span style={{color: 'var(--accent-700)'}}>Synced 100%</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────── AI call log ──────────

function CallOutcomePill({ outcome, label }) {
  const map = {
    connected: "outreach", accepted: "booked", escalated: "escalated",
    voicemail: "ingested", noanswer: "lost", delivered: "queued",
    "outbound-confirm": "won",
  };
  return <StatePill state={map[outcome] || "ingested"} label={label}/>;
}

function CallLogScreen({ variation, onVariation, onOpenCall }) {
  const vars = [
    { value: "table",    label: "Table" },
    { value: "cards",    label: "Conversation cards" },
  ];
  const [selected, setSelected] = React.useState(null);
  const calls = window.RELAY_DATA.CALLS;

  return (
    <>
      <PageHead title="AI call log" sub="Every voice + SMS attempt the AI has made today, with transcripts and disclosure status."
        variation={variation} variations={vars} onVariation={onVariation}
        right={<><button className="btn btn-sm"><Icon name="filter" size={12}/> Filters</button><button className="btn btn-sm"><Icon name="download" size={12}/> Export day</button></>}/>
      <div style={{display:'flex', gap:6, marginBottom:12, flexWrap:'wrap'}}>
        {["All outcomes","Connected","Voicemail","No answer","Escalated","SMS"].map((c, i) => (
          <button key={c} className={"chip" + (i === 0 ? " active" : "")}>{c}</button>
        ))}
        <span style={{flex:1}}></span>
        <button className="chip"><Icon name="cal" size={11}/> Today, Apr 14</button>
        <button className="chip"><Icon name="user" size={11}/> Any patient</button>
        <button className="chip"><Icon name="link" size={11}/> Any language</button>
      </div>

      {variation === "cards"
        ? <CallLogCards calls={calls}/>
        : <CallLogTable calls={calls} onSelect={c => setSelected(c)}/>}

      {selected && <CallDetailModal call={selected} onClose={() => setSelected(null)}/>}
    </>
  );
}

function CallLogTable({ calls, onSelect }) {
  return (
    <div style={{background:'var(--surface)', border:'1px solid var(--hairline)', borderRadius: 'var(--radius)', overflow:'hidden'}}>
      <table className="tbl">
        <thead>
          <tr><th>Time</th><th>Patient</th><th>Attempt</th><th>Channel</th><th>Outcome</th><th>Duration</th><th>Summary</th><th></th></tr>
        </thead>
        <tbody>
          {calls.map(c => (
            <tr key={c.id} className="row-clickable" onClick={() => onSelect(c)}>
              <td className="mono text-xs">{c.time}</td>
              <td><span className="name-link">{c.patient}</span></td>
              <td className="text-3 tnum">#{c.attempt || "—"}</td>
              <td><Icon name={c.channel === "voice" ? "phone" : "sms"} size={13}/> <span className="text-3 text-xs">{c.channel === "voice" ? "Voice" : "SMS"}</span></td>
              <td><CallOutcomePill outcome={c.outcome} label={c.outcomeLabel}/></td>
              <td className="mono text-xs tnum">{c.duration}</td>
              <td className="text-3 text-xs" style={{maxWidth: 360, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.summary}</td>
              <td><button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); onSelect(c); }}><Icon name="arrow" size={12}/></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CallDetailModal({ call, onClose }) {
  return (
    <div className="modal-shade" onClick={onClose}>
      <div className="modal" style={{width: 720}} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <h3 style={{margin: 0, fontSize: 15}}>{call.patient}</h3>
              <span className="text-3 text-xs">· attempt #{call.attempt || "—"}</span>
              {call.escalated && <span className="pill escalated bare">Escalated</span>}
            </div>
            <p className="card-sub">{call.time} · {call.channel === 'voice' ? 'Voice' : 'SMS'} · {call.duration} · {call.lang}</p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={13}/></button>
        </div>
        <div className="modal-body">
          {call.channel === "voice"
            ? <TranscriptPanel data={{
                patient: call.patient,
                call: `${call.id} · Attempt #${call.attempt} · Voice · ${call.duration}`,
                disclosure: call.disclosure,
                summary: call.summary,
                turns: window.RELAY_DATA.TRANSCRIPT_SAMPLE.turns,
              }}/>
            : <div className="transcript">
                <div className="transcript-summary"><span className="fw-6">AI summary · </span>{call.summary}</div>
              </div>}
          <div className="divider"></div>
          <div className="stack-tight" style={{fontSize:12.5}}>
            <div className="between"><span className="text-3">Disclosure played</span><span>{call.disclosure ? "Yes" : "n/a"}</span></div>
            <div className="between"><span className="text-3">Escalation raised</span><span>{call.escalated ? "Yes — clinical" : "No"}</span></div>
            <div className="between"><span className="text-3">Audio retention</span><span>30 days</span></div>
            <div className="between"><span className="text-3">Open in patient view</span><a className="name-link" href="#">{call.patientId}</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallLogCards({ calls }) {
  return (
    <div className="grid" style={{gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)'}}>
      {calls.map(c => (
        <div className="card" key={c.id}>
          <div className="card-head">
            <div style={{display:'flex', alignItems:'center', gap: 10}}>
              <div style={{width:32, height:32, borderRadius: 8, background: 'var(--tint)', display:'grid', placeItems:'center', border: '1px solid var(--hairline)'}}>
                <Icon name={c.channel === "voice" ? "phone" : "sms"} size={14}/>
              </div>
              <div>
                <div className="fw-6">{c.patient}</div>
                <div className="text-xs text-3">{c.time} · attempt #{c.attempt || '—'} · {c.lang}</div>
              </div>
            </div>
            <CallOutcomePill outcome={c.outcome} label={c.outcomeLabel}/>
          </div>
          <div className="transcript-summary" style={{fontSize: 12.5}}>
            <span className="fw-6">AI summary · </span>{c.summary}
          </div>
          {c.channel === 'voice' && (
            <div className="scrubber" style={{marginTop: 10}}>
              <button className="btn btn-sm btn-icon"><Icon name="play" size={12}/></button>
              <div className="scrubber-bar"></div>
              <span className="mono text-3">{c.duration}</span>
            </div>
          )}
          <div style={{display:'flex', gap: 6, marginTop: 10}}>
            {c.disclosure && <span className="tag"><Icon name="shield" size={11}/> Disclosed</span>}
            {c.escalated && <span className="pill escalated bare">Escalated</span>}
            <span style={{flex:1}}></span>
            <button className="btn btn-sm btn-ghost"><Icon name="transcript" size={11}/> Open transcript</button>
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  ReferralListScreen, ReferralDetailScreen, CallLogScreen, StateLabel, PriorityPill,
  StateDropdown, PriorityLegend, priClass, CallDetailModal,
});
