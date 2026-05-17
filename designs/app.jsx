// Main Relay app — sidebar shell, routing, tweaks wiring.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "compact",
  "persona": "ma",
  "dashLayout": "vitals",
  "listLayout": "table",
  "detailLayout": "timeline",
  "callLayout": "table",
  "analyticsLayout": "hero"
}/*EDITMODE-END*/;

const NAV = [
  { id: "dashboard", label: "Dashboard",       icon: "home" },
  { id: "alerts",    label: "Urgent alerts",   icon: "alert", urgent: 1 },
  { id: "action",    label: "Confirm queue",   icon: "check", count: 2 },
  { id: "referrals", label: "Referrals",       icon: "list", count: 12 },
  { id: "calls",     label: "AI call log",     icon: "phone" },
  { id: "calendar",  label: "Calendar",        icon: "cal" },
  { id: "analytics", label: "Analytics",       icon: "chart" },
  { id: "ingest",    label: "Ingest",          icon: "upload" },
  { id: "settings",  label: "Settings",        icon: "cog" },
];

function Sidebar({ active, onNav, density }) {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark">R</div>
        <div>
          <div className="sb-name">Relay</div>
          <div className="sb-sub">Bay Cardiology · Mission Bay</div>
        </div>
      </div>
      <div className="sb-section">Workspace</div>
      {NAV.slice(0, 7).map(n => (
        <button key={n.id} className={"nav-item" + (active === n.id ? " active" : "")} onClick={() => onNav(n.id)}>
          <Icon name={n.icon} size={15}/>
          {n.label}
          {n.urgent ? <span className="nav-count urgent">{n.urgent}</span> : null}
          {n.count && !n.urgent ? <span className="nav-count">{n.count}</span> : null}
        </button>
      ))}
      <div className="sb-section">System</div>
      {NAV.slice(7).map(n => (
        <button key={n.id} className={"nav-item" + (active === n.id ? " active" : "")} onClick={() => onNav(n.id)}>
          <Icon name={n.icon} size={15}/>
          {n.label}
        </button>
      ))}
      <div className="sb-spacer"></div>
      <button className="nav-item">
        <Icon name="logout" size={15}/>
        Sign out
      </button>
    </aside>
  );
}

function TopBar({ persona }) {
  const personas = {
    ma: { initials: "P", name: "Priya N.", role: "Medical assistant" },
    coordinator: { initials: "D", name: "Denise C.", role: "Referral coordinator" },
    admin: { initials: "R", name: "Ray O.", role: "Practice administrator" },
  };
  const p = personas[persona] || personas.ma;
  return (
    <div className="tb">
      <div className="tb-search">
        <Icon name="search" size={14}/>
        <input placeholder="Search patients, calls, transcripts…"/>
        <span className="tb-kbd">⌘K</span>
      </div>
      <div className="tb-right">
        <button className="tb-pill"><span style={{width:8, height:8, borderRadius: '50%', background:'var(--accent)'}}></span> Production · Mission Bay <Icon name="chevron" size={11}/></button>
        <button className="tb-iconbtn"><Icon name="bell" size={15}/><span className="tb-bell-dot"></span></button>
        <button className="tb-avatar" title={p.name + " — " + p.role}>{p.initials}</button>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState("dashboard");
  const [openReferral, setOpenReferral] = React.useState(null);

  // Sync body data-* attrs for CSS-driven density and persona
  React.useEffect(() => {
    document.body.setAttribute("data-density", t.density);
    document.body.setAttribute("data-persona", t.persona);
  }, [t.density, t.persona]);

  // Navigation helper that clears any open referral when changing pages
  const navigate = (p) => { setOpenReferral(null); setPage(p); };

  // The selected screen renderer
  let body;
  if (openReferral) {
    body = <ReferralDetailScreen
      referral={openReferral}
      variation={t.detailLayout}
      onVariation={v => setTweak("detailLayout", v)}
      onBack={() => setOpenReferral(null)}/>;
  } else if (page === "dashboard") {
    body = <DashboardScreen variation={t.dashLayout} onVariation={v => setTweak("dashLayout", v)} onNavigate={navigate}/>;
  } else if (page === "referrals") {
    body = <ReferralListScreen
      variation={t.listLayout}
      onVariation={v => setTweak("listLayout", v)}
      onOpenReferral={r => setOpenReferral(r)}/>;
  } else if (page === "calls") {
    body = <CallLogScreen variation={t.callLayout} onVariation={v => setTweak("callLayout", v)}/>;
  } else if (page === "analytics") {
    body = <AnalyticsScreen variation={t.analyticsLayout} onVariation={v => setTweak("analyticsLayout", v)}/>;
  } else if (page === "alerts") {
    body = <AlertsScreen/>;
  } else if (page === "action") {
    body = <ActionQueueScreen/>;
  } else if (page === "calendar") {
    body = <CalendarScreen/>;
  } else if (page === "settings") {
    body = <SettingsScreen/>;
  } else if (page === "ingest") {
    body = <IngestionScreen/>;
  }

  return (
    <div className="shell">
      <Sidebar active={openReferral ? "referrals" : page} onNav={navigate} density={t.density}/>
      <div className="main">
        <TopBar persona={t.persona}/>
        <div className="pg">{body}</div>
      </div>

      <TweaksPanel>
        <TweakSection label="View"/>
        <TweakRadio label="Density"
          value={t.density}
          options={["compact", "regular", "roomy"]}
          onChange={v => setTweak("density", v)}/>
        <TweakSelect label="Persona"
          value={t.persona}
          options={[
            { value: "ma", label: "MA (Priya)" },
            { value: "coordinator", label: "Coordinator (Denise)" },
            { value: "admin", label: "Admin (Ray)" },
          ]}
          onChange={v => setTweak("persona", v)}/>

        <TweakSection label="Per-screen layout"/>
        <TweakRadio label="Dashboard"
          value={t.dashLayout}
          options={[
            { value: "action", label: "Action" },
            { value: "vitals", label: "Vitals" },
            { value: "split",  label: "Split" },
          ]}
          onChange={v => setTweak("dashLayout", v)}/>
        <TweakRadio label="Referral list"
          value={t.listLayout}
          options={[
            { value: "table", label: "Table" },
            { value: "cards", label: "Cards" },
          ]}
          onChange={v => setTweak("listLayout", v)}/>
        <TweakRadio label="Referral detail"
          value={t.detailLayout}
          options={[
            { value: "two-col",  label: "Two-col" },
            { value: "timeline", label: "Timeline" },
          ]}
          onChange={v => setTweak("detailLayout", v)}/>
        <TweakRadio label="Call log"
          value={t.callLayout}
          options={[
            { value: "table", label: "Table" },
            { value: "cards", label: "Cards" },
          ]}
          onChange={v => setTweak("callLayout", v)}/>
        <TweakRadio label="Analytics"
          value={t.analyticsLayout}
          options={[
            { value: "hero", label: "Funnel" },
            { value: "grid", label: "KPI" },
          ]}
          onChange={v => setTweak("analyticsLayout", v)}/>

        <TweakSection label="Jump to screen"/>
        <TweakButton label="Dashboard"          onClick={() => navigate("dashboard")} />
        <TweakButton label="Urgent alerts"      onClick={() => navigate("alerts")} />
        <TweakButton label="Confirm queue (MA)" onClick={() => navigate("action")} />
        <TweakButton label="Referral list"      onClick={() => navigate("referrals")} />
        <TweakButton label="Referral detail"    onClick={() => { setPage("referrals"); setOpenReferral(window.RELAY_DATA.REFERRALS[0]); }} />
        <TweakButton label="AI call log"        onClick={() => navigate("calls")} />
        <TweakButton label="Analytics"          onClick={() => navigate("analytics")} />
        <TweakButton label="Calendar"           onClick={() => navigate("calendar")} />
        <TweakButton label="Settings"           onClick={() => navigate("settings")} />
        <TweakButton label="Ingest"             onClick={() => navigate("ingest")} />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
