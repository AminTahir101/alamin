
"use client";

import dashboardData from "./dashboardImage.json";
import { useState, useEffect, ReactNode } from "react";

const DASHBOARD_IMG: string = (dashboardData as { src: string }).src;

const PASSWORD = "alamin2025";

/* ─── AUTO DAY/NIGHT (6am-8pm = day, 8pm-6am = night) ───────────────────── */
function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => { const h = new Date().getHours(); setDark(h >= 20 || h < 6); };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, []);
  return dark;
}

/* ─── ALAMIN DESIGN SYSTEM — extracted from alamin-ai.com ───────────────── */
const light = {
  // Page
  pageBg: "#F4F4F5",
  // Nav
  navBg: "#FFFFFF",
  navBorder: "#E4E4E7",
  navText: "#18181B",
  navMuted: "#71717A",
  // Surfaces
  surface: "#FFFFFF",
  surfaceAlt: "#F4F4F5",
  surfaceCard: "#FFFFFF",
  border: "#E4E4E7",
  borderLight: "#F0F0F2",
  // Text
  text: "#18181B",
  textMid: "#3F3F46",
  textMuted: "#71717A",
  textFaint: "#A1A1AA",
  // Brand accent — from landing page headline gradient
  purple: "#7C3AED",
  purpleLight: "#EDE9FE",
  purpleBorder: "#C4B5FD",
  blue: "#2563EB",
  blueLight: "#DBEAFE",
  blueBorder: "#93C5FD",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  greenBorder: "#86EFAC",
  amber: "#D97706",
  amberLight: "#FEF3C7",
  amberBorder: "#FCD34D",
  red: "#DC2626",
  redLight: "#FEE2E2",
  // CTA
  cta: "#18181B",
  ctaText: "#FFFFFF",
  ctaSecondary: "#F4F4F5",
  ctaSecondaryText: "#18181B",
  ctaSecondaryBorder: "#E4E4E7",
  // Code
  codeBg: "#18181B",
  codeText: "#D4D4D8",
  // Shadows
  shadow: "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
  shadowLg: "0 8px 32px rgba(0,0,0,0.12)",
};

const dark_t = {
  pageBg: "#0D1117",
  navBg: "#0D1117",
  navBorder: "#21262D",
  navText: "#F0F6FC",
  navMuted: "#8B949E",
  surface: "#161B22",
  surfaceAlt: "#1C2128",
  surfaceCard: "#161B22",
  border: "#21262D",
  borderLight: "#30363D",
  text: "#F0F6FC",
  textMid: "#C9D1D9",
  textMuted: "#8B949E",
  textFaint: "#484F58",
  purple: "#A78BFA",
  purpleLight: "#1E1B4B",
  purpleBorder: "#4C1D95",
  blue: "#60A5FA",
  blueLight: "#1E3A5F",
  blueBorder: "#1D4ED8",
  green: "#4ADE80",
  greenLight: "#052E16",
  greenBorder: "#166534",
  amber: "#FBBF24",
  amberLight: "#451A03",
  amberBorder: "#92400E",
  red: "#F87171",
  redLight: "#450A0A",
  cta: "#F0F6FC",
  ctaText: "#0D1117",
  ctaSecondary: "#21262D",
  ctaSecondaryText: "#F0F6FC",
  ctaSecondaryBorder: "#30363D",
  codeBg: "#161B22",
  codeText: "#E6EDF3",
  shadow: "0 1px 3px rgba(0,0,0,0.3)",
  shadowMd: "0 4px 16px rgba(0,0,0,0.4)",
  shadowLg: "0 8px 32px rgba(0,0,0,0.5)",
};

type Theme = typeof light;

/* ─── LOGO ───────────────────────────────────────────────────────────────── */
function Logo({ size = 32 }: { size?: number }) {
  const [err, setErr] = useState(false);
  if (!err) return (
    <img src="https://alamin-ai.com/favicon.ico" width={size} height={size}
      alt="ALAMIN" style={{ borderRadius: size * 0.22, display: "block" }}
      onError={() => setErr(true)} />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <radialGradient id="lg" cx="40%" cy="36%" r="60%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="60%" stopColor="#6D5FE8" />
          <stop offset="100%" stopColor="#3730A3" />
        </radialGradient>
        <filter id="lf"><feGaussianBlur stdDeviation="2.5"/></filter>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0D1117"/>
      <circle cx="32" cy="32" r="20" fill="#6D5FE8" opacity="0.2" filter="url(#lf)"/>
      <circle cx="32" cy="32" r="14" fill="url(#lg)"/>
      <ellipse cx="27" cy="26" rx="5" ry="3" fill="white" opacity="0.18"/>
    </svg>
  );
}

/* ─── SECTIONS ───────────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: "intro", label: "Overview" },
  { id: "features", label: "Product" },
  { id: "business", label: "Business" },
  { id: "tech", label: "Architecture" },
  { id: "investor", label: "Investor" },
];

const FEATURES = [
  {
    name: "Dashboard",
    icon: "⊞",
    tag: "Command Center",
    desc: "Your company in one view. Performance, execution, weak spots, and what to do about them. Powered by live AI diagnostics.",
    points: ["AI command with live diagnosis","Company health score","KPIs at risk tracking","Open tasks and blockers"],
    hasRealScreenshot: true,
  },
  {
    name: "Your AI",
    icon: "✦",
    tag: "AI Workspace",
    desc: "The AI workspace generates OKRs, diagnoses blockers, and translates performance signals into action — from a single input.",
    points: ["OKR generation from KPI inputs","Blocker diagnosis","Performance signal translation","Action plan publishing"],
    hasRealScreenshot: false,
  },
  {
    name: "Objectives",
    icon: "◎",
    tag: "Strategic Goals",
    desc: "Set and track strategic objectives with full visibility into progress, ownership, and KPI linkage across departments.",
    points: ["Objective creation and tracking","Department-level ownership","KPI linkage","Progress visibility"],
    hasRealScreenshot: false,
  },
  {
    name: "OKRs",
    icon: "◈",
    tag: "Key Results",
    desc: "Measurable key results linked to objectives and KPIs. Progress calculated automatically from live data.",
    points: ["Key result tracking","Bi-directional KPI linkage","Auto-progress calculation","Quarterly cycles"],
    hasRealScreenshot: false,
  },
  {
    name: "KPIs",
    icon: "↗",
    tag: "Performance Metrics",
    desc: "Define every business metric with target, direction, owner, and department. AI flags deviations and surfaces root causes.",
    points: ["Full KPI taxonomy","Target and direction tracking","AI anomaly detection","Owner assignment"],
    hasRealScreenshot: false,
  },
  {
    name: "Tasks",
    icon: "✓",
    tag: "Execution Layer",
    desc: "Tasks assigned to real owners, linked to objectives. Review and track completion across the whole organization.",
    points: ["Task assignment and ownership","Objective linkage","Completion tracking","Overdue detection"],
    hasRealScreenshot: false,
  },
];

/* ─── APP SCREEN MOCKUPS (matching exact ALAMIN UI from screenshot) ──────── */
function AppScreenMockup({ name, T }: { name: string; T: Theme }) {
  const isDark = T.pageBg === "#0D1117";
  const sidebar = isDark ? "#0D1117" : "#0F1729";
  const sidebarActive = isDark ? "#1C2128" : "#1C2952";
  const sidebarText = "#8B949E";
  const sidebarActiveText = "#F0F6FC";
  const topbar = T.surface;
  const cardBg = isDark ? "#161B22" : "#1A2744";
  const cardBorder = isDark ? "#21262D" : "#243159";
  const metaText = isDark ? "#8B949E" : "#6B7A99";
  const bodyText = isDark ? "#C9D1D9" : "#E2E8F0";
  const headText = isDark ? "#F0F6FC" : "#FFFFFF";

  const sidebarItems = ["Dashboard","Your AI","Objectives","OKRs","KPIs","Tasks","Reports","My Work","Departments","Settings"];
  const activeIndex = sidebarItems.indexOf(name);

  return (
    <div style={{ background: isDark ? "#0D1117" : "#0A0F1E", borderRadius: 12, overflow: "hidden", display: "flex", height: 420 }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: sidebar, padding: "16px 0", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        <div style={{ padding: "0 16px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={28} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: headText, fontFamily: "sans-serif" }}>ALAMIN</div>
            <div style={{ fontSize: 9, color: sidebarText, fontFamily: "sans-serif" }}>AI Performance Intelligence</div>
          </div>
        </div>
        <div style={{ padding: "0 8px 8px", borderBottom: `1px solid ${cardBorder}`, marginBottom: 4 }}>
          <div style={{ fontSize: 9, color: sidebarText, fontFamily: "sans-serif", padding: "4px 8px", textTransform: "uppercase", letterSpacing: 1 }}>Organization</div>
          <div style={{ padding: "6px 8px", borderRadius: 6, background: sidebarActive }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: headText, fontFamily: "sans-serif" }}>simple-humans</div>
            <div style={{ fontSize: 9, color: sidebarText, fontFamily: "sans-serif" }}>therealamintahir@gmail.com</div>
          </div>
        </div>
        <div style={{ padding: "4px 8px" }}>
          <div style={{ fontSize: 9, color: sidebarText, fontFamily: "sans-serif", padding: "4px 8px", textTransform: "uppercase", letterSpacing: 1 }}>Workspace</div>
          {sidebarItems.map((item, i) => (
            <div key={i} style={{ padding: "7px 10px", borderRadius: 6, background: i === activeIndex ? sidebarActive : "none", display: "flex", alignItems: "center", gap: 8, marginBottom: 1 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: i === activeIndex ? T.purple : cardBorder, opacity: i === activeIndex ? 1 : 0.5 }} />
              <span style={{ fontSize: 11, color: i === activeIndex ? sidebarActiveText : sidebarText, fontWeight: i === activeIndex ? 600 : 400, fontFamily: "sans-serif" }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{ background: topbar, borderBottom: `1px solid ${T.border}`, padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, color: metaText, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>Performance Workspace</div>
            <div style={{ fontSize: 11, color: T.textMid, fontFamily: "sans-serif" }}>/o/simple-humans</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 10, color: T.textMid, fontFamily: "sans-serif" }}>Open AI Workspace</div>
            <div style={{ padding: "5px 12px", borderRadius: 6, background: T.cta, fontSize: 10, color: T.ctaText, fontFamily: "sans-serif", fontWeight: 600 }}>Refresh dashboard</div>
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, padding: "20px", overflow: "hidden", background: isDark ? "#0D1117" : "#0A0F1E" }}>
          <div style={{ fontSize: 9, color: metaText, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Q3 2026 · Active</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: headText, fontFamily: "sans-serif", marginBottom: 4 }}>{name}</div>
          <div style={{ fontSize: 11, color: bodyText, fontFamily: "sans-serif", marginBottom: 16, opacity: 0.7 }}>Your company in one view. Performance, execution, the weak spots, and what to do about them.</div>
          {/* AI Command Card */}
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10, padding: 16, display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: isDark ? "#1C2128" : "#243159", borderRadius: 20, padding: "3px 10px", marginBottom: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />
                <span style={{ fontSize: 9, color: "#4ADE80", fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>AI Command</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: headText, fontFamily: "sans-serif", lineHeight: 1.4, marginBottom: 8 }}>The current cycle is under pressure and needs intervention.</div>
              <div style={{ fontSize: 10, color: bodyText, fontFamily: "sans-serif", lineHeight: 1.5, marginBottom: 12, opacity: 0.8 }}>Use the AI workspace to generate OKRs, diagnose blockers, and translate performance signals into action.</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Open AI Workspace","Create Objective","View KPIs","Review Tasks"].map((btn, i) => (
                  <div key={i} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${cardBorder}`, fontSize: 9, color: bodyText, fontFamily: "sans-serif" }}>{btn}</div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Company Health", val: "0%", sub: "Off Track", c: "#F87171", bg: "#450A0A" },
                { label: "KPIs at Risk", val: "0", sub: "0 on track", c: "#4ADE80", bg: "#052E16" },
                { label: "Open Tasks", val: "5", sub: "0 overdue · 0 blocked", c: T.blue, bg: T.blueLight + "33" },
              ].map((stat, i) => (
                <div key={i} style={{ background: isDark ? "#1C2128" : "#1A2F5A", border: `1px solid ${cardBorder}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 8, color: metaText, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>{stat.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: stat.c, fontFamily: "sans-serif" }}>{stat.val}</div>
                  <div style={{ fontSize: 8, color: metaText, fontFamily: "sans-serif" }}>{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Bottom stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[
              { label: "Company Score", val: "0", sub: "Off Track" },
              { label: "Objectives", val: "2", sub: "0 completed" },
              { label: "Open Tasks", val: "5", sub: "0 completed" },
              { label: "Active OKRs", val: "2/0", sub: "Task completion 0%" },
            ].map((s, i) => (
              <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 8, color: metaText, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: headText, fontFamily: "sans-serif" }}>{s.val}</div>
                <div style={{ fontSize: 8, color: metaText, fontFamily: "sans-serif", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PASSWORD GATE ──────────────────────────────────────────────────────── */
function Gate({ onUnlock, T }: { onUnlock: () => void; T: Theme }) {
  const [v, setV] = useState(""), [err, setErr] = useState(false), [show, setShow] = useState(false);
  const go = () => { if (v === PASSWORD) onUnlock(); else { setErr(true); setV(""); setTimeout(() => setErr(false), 2000); } };
  const isDark = T.pageBg === "#0D1117";

  return (
    <div style={{ minHeight: "100vh", background: T.pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .gk-input{width:100%;padding:12px 46px 12px 16px;border:1px solid ${T.border};border-radius:8px;font-size:14px;color:${T.text};-webkit-text-fill-color:${T.text};background:${T.surfaceAlt};font-family:'JetBrains Mono',monospace;letter-spacing:3px;outline:none;transition:border-color .15s;color-scheme:${isDark?"dark":"light"}}
        .gk-input::placeholder{color:${T.textFaint};-webkit-text-fill-color:${T.textFaint};letter-spacing:1px}
        .gk-input:focus{border-color:${T.purple}}
        .gk-input.err{border-color:${T.red};background:${T.redLight}20}
        .gk-btn{width:100%;padding:11px;background:${T.cta};color:${T.ctaText};-webkit-text-fill-color:${T.ctaText};border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:opacity .15s}
        .gk-btn:hover{opacity:0.85}
        .gk-btn:disabled{opacity:0.4;cursor:default}
      `}</style>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}><Logo size={56} /></div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 24, color: T.text, marginBottom: 4, letterSpacing: "-0.5px" }}>ALAMIN</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 6, fontFamily: "'Inter',sans-serif" }}>AI Performance Intelligence</div>
        <div style={{ width: 24, height: 2, background: T.purple, borderRadius: 2, margin: "14px auto 28px" }} />
        <div style={{ fontSize: 14, color: T.textMid, marginBottom: 28, lineHeight: 1.7, fontFamily: "'Inter',sans-serif" }}>
          This investor deck is private.<br />Enter your access code to continue.
        </div>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input className={`gk-input${err?" err":""}`} type={show?"text":"password"} value={v}
            onChange={e => setV(e.target.value)} onKeyDown={e => e.key==="Enter"&&go()}
            placeholder="Access password" autoComplete="off" />
          <button onClick={()=>setShow(!show)} type="button"
            style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:T.textFaint,fontSize:14,padding:0 }}>
            {show?"●":"○"}
          </button>
        </div>
        {err && <div style={{ fontSize: 13, color: T.red, marginBottom: 10, fontFamily: "'Inter',sans-serif" }}>Incorrect — try again.</div>}
        <button className="gk-btn" onClick={go} disabled={!v} type="button">Access Deck →</button>
        <div style={{ marginTop: 24, fontSize: 11, color: T.textFaint, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>🔒 CONFIDENTIAL · NOT INDEXED</div>
      </div>
    </div>
  );
}

/* ─── MAIN DECK ──────────────────────────────────────────────────────────── */
export default function AlamineProductDeck() {
  const isDarkTheme = useTheme();
  const T: Theme = isDarkTheme ? dark_t : light;
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState("intro");
  const [featIdx, setFeatIdx] = useState(0);

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} T={T} />;

  const feat = FEATURES[featIdx];
  const SAR = 0.267;

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: T.pageBg, minHeight: "100vh", color: T.text, transition: "background .3s, color .3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${T.pageBg}}::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        .dk-card{transition:box-shadow .2s,transform .2s}.dk-card:hover{box-shadow:${T.shadowMd};transform:translateY(-2px)}
        .dk-nav-btn{background:none;border:none;cursor:pointer;font-family:'Inter',sans-serif;transition:color .15s}
        .dk-feat{cursor:pointer;transition:all .15s;font-family:'Inter',sans-serif}
        pre{font-family:'JetBrains Mono',monospace;white-space:pre-wrap;word-break:break-word}
        a{color:${T.purple};text-decoration:none}
      `}</style>

      {/* HEADER */}
      <header style={{ background: T.navBg, borderBottom: `1px solid ${T.navBorder}`, padding: "0 40px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={30} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.navText, letterSpacing: "-0.3px" }}>ALAMIN</div>
            <div style={{ fontSize: 9, color: T.navMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>AI PERFORMANCE INTELLIGENCE</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {SECTIONS.map(s => (
            <button key={s.id} className="dk-nav-btn" onClick={() => setActive(s.id)}
              style={{ fontSize: 13, color: active===s.id ? T.navText : T.navMuted, fontWeight: active===s.id ? 600 : 400, padding: "6px 12px", borderRadius: 6, background: active===s.id ? T.surfaceAlt : "none" }}>
              {s.label}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
          <a href="https://alamin-ai.com" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: T.navMuted, padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}` }}>
            alamin-ai.com ↗
          </a>
          <div style={{ fontSize: 11, color: T.textFaint, fontFamily: "'JetBrains Mono',monospace" }}>
            {isDarkTheme ? "🌙" : "☀️"}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 40px" }}>

        {/* ══ OVERVIEW ══ */}
        {active === "intro" && (
          <div style={{ paddingTop: 80, paddingBottom: 80 }}>
            {/* Hero */}
            <div style={{ maxWidth: 700, marginBottom: 64 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 20, padding: "4px 14px", marginBottom: 28 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
                <span style={{ fontSize: 12, color: T.textMuted }}>Built for serious teams that need execution clarity</span>
              </div>
              <h1 style={{ fontSize: 52, fontWeight: 800, color: T.text, lineHeight: 1.1, letterSpacing: "-1.5px", marginBottom: 20 }}>
                Turn company strategy<br />into{" "}
                <span style={{ background: "linear-gradient(135deg, #7C3AED, #60A5FA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  measurable execution
                </span>
                {" "}with AI.
              </h1>
              <p style={{ fontSize: 17, color: T.textMuted, lineHeight: 1.75, marginBottom: 36, maxWidth: 580 }}>
                ALAMIN helps companies define goals, generate measurable OKRs, map Jobs-To-Be-Done, assign real work, and evaluate performance from one workspace.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={()=>setActive("features")} style={{ padding: "11px 24px", background: T.cta, color: T.ctaText, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  See the Product →
                </button>
                <button onClick={()=>setActive("investor")} style={{ padding: "11px 24px", background: T.ctaSecondary, color: T.ctaSecondaryText, border: `1px solid ${T.ctaSecondaryBorder}`, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                  Investor Statement
                </button>
              </div>
            </div>

            {/* App preview - REAL screenshot */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 64, boxShadow: T.shadowLg }}>
              <div style={{ background: T.surfaceAlt, padding: "8px 14px", display: "flex", gap: 6, alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
                {["#FF5F56","#FFBD2E","#27C93F"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
                <div style={{ flex: 1, background: T.border, borderRadius: 5, height: 12, marginLeft: 8, display: "flex", alignItems: "center", paddingLeft: 8 }}>
                  <span style={{ fontSize: 9, color: T.textFaint, fontFamily: "'JetBrains Mono',monospace" }}>app.alamin-ai.com/o/simple-humans</span>
                </div>
              </div>
              <img src={DASHBOARD_IMG} alt="ALAMIN Dashboard" style={{ width: "100%", display: "block" }} />
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 64 }}>
              {[
                { val: "10x", label: "less manual planning", desc: "Automated KPI→OKR→JTBD generation" },
                { val: "1", label: "workspace for goals to execution", desc: "From strategy input to task assignment" },
                { val: "AI", label: "built into every workflow", desc: "Continuous performance diagnosis" },
              ].map((s, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "24px 20px" }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: T.text, marginBottom: 4 }}>{s.val}</div>
                  <div style={{ fontSize: 13, color: T.textMid, fontWeight: 500, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{s.desc}</div>
                </div>
              ))}
            </div>

            {/* Problem cards */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: T.textFaint, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 20, fontFamily: "'JetBrains Mono',monospace" }}>The Problem</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
                {[
                  { icon: "⚡", title: "Strategy-Execution Gap", body: "AI tools generate insights but leave no way to convert them into measurable outcomes. Strategy floats. Execution stalls.", c: T.purple },
                  { icon: "📊", title: "Fragmented Systems", body: "KPIs in spreadsheets. OKRs in Notion. Tasks in Jira. No intelligence binds them together.", c: T.blue },
                  { icon: "🤖", title: "AI Without Structure", body: "LLM tools answer prompts but cannot monitor performance or trigger corrective action.", c: T.green },
                  { icon: "🏢", title: "Enterprise Gap", body: "Consumer AI tools lack multi-tenancy, RLS data isolation, and audit trails enterprise procurement requires.", c: T.amber },
                ].map((p, i) => (
                  <div key={i} className="dk-card" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "22px 20px", borderTop: `2px solid ${p.c}` }}>
                    <div style={{ fontSize: 24, marginBottom: 12 }}>{p.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>{p.title}</div>
                    <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7 }}>{p.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ FEATURES ══ */}
        {active === "features" && (
          <div style={{ paddingTop: 64, paddingBottom: 80 }}>
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontSize: 11, color: T.textFaint, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, fontFamily: "'JetBrains Mono',monospace" }}>Product Features</div>
              <h2 style={{ fontSize: 36, fontWeight: 800, color: T.text, letterSpacing: "-0.8px", marginBottom: 12 }}>Built to connect strategy, execution, and evaluation.</h2>
              <p style={{ fontSize: 15, color: T.textMuted, maxWidth: 540, lineHeight: 1.7 }}>ALAMIN is not another reporting dashboard. It connects KPI signals, strategic goals, work ownership, and AI recommendations in one product.</p>
            </div>

            {/* Feature tabs */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {FEATURES.map((f, i) => (
                <button key={i} className="dk-feat" onClick={() => setFeatIdx(i)}
                  style={{ padding: "8px 16px", border: `1px solid ${featIdx===i ? T.purple : T.border}`, borderRadius: 8, background: featIdx===i ? T.purpleLight : T.surface, color: featIdx===i ? T.purple : T.textMuted, fontSize: 13, fontWeight: featIdx===i ? 600 : 400, display: "flex", gap: 6, alignItems: "center" }}>
                  <span>{f.icon}</span><span>{f.name}</span>
                </button>
              ))}
            </div>

            {/* Screen display */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 24, boxShadow: T.shadowMd }}>
              <div style={{ background: T.surfaceAlt, padding: "8px 14px", display: "flex", gap: 6, borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                {["#FF5F56","#FFBD2E","#27C93F"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
                <div style={{ flex: 1, background: T.border, borderRadius: 5, height: 12, marginLeft: 8, display: "flex", alignItems: "center", paddingLeft: 8 }}>
                  <span style={{ fontSize: 9, color: T.textFaint, fontFamily: "'JetBrains Mono',monospace" }}>
                    app.alamin-ai.com/o/simple-humans/{feat.name.toLowerCase().replace(/\s+/g,"-")}
                  </span>
                </div>
              </div>
              {feat.name === "Dashboard" ? (
                <img src={DASHBOARD_IMG} alt="ALAMIN Dashboard" style={{ width: "100%", display: "block" }} />
              ) : (
                <AppScreenMockup name={feat.name} T={T} />
              )}
            </div>

            {/* Feature detail */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 40, padding: "8px 0 24px" }}>
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>{feat.icon}</span>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{feat.name}</div>
                    <div style={{ fontSize: 10, color: T.purple, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{feat.tag}</div>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: T.textMid, lineHeight: 1.8 }}>{feat.desc}</p>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textFaint, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, fontFamily: "'JetBrains Mono',monospace" }}>What it does</div>
                {feat.points.map((p, j) => (
                  <div key={j} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.purple, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ fontSize: 13, color: T.textMid }}>{p}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution flow */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 32 }}>
              <div style={{ fontSize: 10, color: T.textFaint, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16, fontFamily: "'JetBrains Mono',monospace" }}>Execution flow</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {["Strategy","KPI","OKR","JTBD","Task","Performance","Insight","Improvement"].map((s,i,a) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surfaceAlt }}>
                      <span style={{ fontSize: 12, color: T.textMid }}>{s}</span>
                    </div>
                    {i < a.length-1 && <span style={{ color: T.textFaint, fontSize: 14 }}>→</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ BUSINESS ══ */}
        {active === "business" && (
          <div style={{ paddingTop: 64, paddingBottom: 80 }}>
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontSize: 11, color: T.textFaint, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, fontFamily: "'JetBrains Mono',monospace" }}>Business Model</div>
              <h2 style={{ fontSize: 36, fontWeight: 800, color: T.text, letterSpacing: "-0.8px", marginBottom: 12 }}>Our pricing plans.</h2>
              <p style={{ fontSize: 15, color: T.textMuted, maxWidth: 480, lineHeight: 1.7 }}>Seat-based pricing in SAR. GCC-first go-to-market with PayTabs billing.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20, marginBottom: 48 }}>
              {[
                { tier:"Core", sar:"35 SAR", usd:`~$${(35*SAR).toFixed(0)}`, period:"/ seat / month", desc:"For companies that need a structured execution system without manual KPI and OKR overhead.", features:["KPI, Objectives, and OKRs","AI-assisted generation","Department ownership","Execution tracking","Standard dashboards"], c:T.purple, bg:T.purpleLight, border:T.purpleBorder, hot:false },
                { tier:"Growth", sar:"50 SAR", usd:`~$${(50*SAR).toFixed(0)}`, period:"/ seat / month", desc:"For organizations that need deeper execution intelligence, visibility, and control.", features:["Everything in Core","Advanced AI recommendations","JTBD mapping and task orchestration","Cross-department visibility","Approvals and workflows","Priority support"], c:T.blue, bg:T.blueLight, border:T.blueBorder, hot:true },
                { tier:"Enterprise", sar:"Custom", usd:"", period:"pricing", desc:"For large organizations with rollout, governance, integration, and deployment requirements.", features:["Unlimited scale","Custom onboarding and rollout","Advanced permissions and controls","Dedicated support and SLA","Custom integrations and deployment"], c:T.textMid, bg:T.surfaceAlt, border:T.border, hot:false },
              ].map((m, i) => (
                <div key={i} className="dk-card" style={{ background: T.surface, border: `1.5px solid ${m.hot ? m.border : T.border}`, borderRadius: 16, padding: "28px 24px", position: "relative" }}>
                  {m.hot && <div style={{ position:"absolute",top:-10,left:20,background:T.blue,borderRadius:20,padding:"3px 12px",fontSize:10,color:"#fff",fontWeight:700 }}>Most popular</div>}
                  <div style={{ marginTop: m.hot ? 6 : 0 }}>
                    <div style={{ fontSize: 11, color: m.c, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", marginBottom: 14, fontFamily:"'JetBrains Mono',monospace" }}>{m.tier}</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom: 4 }}>
                      <span style={{ fontSize: 32, fontWeight: 800, color: T.text }}>{m.sar}</span>
                      {m.usd && <span style={{ fontSize: 12, color: T.textFaint, fontFamily:"'JetBrains Mono',monospace" }}>{m.usd}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: T.textFaint, marginBottom: 16 }}>{m.period}</div>
                    <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20, lineHeight: 1.6 }}>{m.desc}</div>
                    <div style={{ borderTop:`1px solid ${T.border}`, paddingTop: 16 }}>
                      {m.features.map((f, j) => (
                        <div key={j} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom: 8 }}>
                          <div style={{ width:4, height:4, borderRadius:"50%", background:m.c, marginTop:5, flexShrink:0 }} />
                          <div style={{ fontSize:13, color:T.textMid }}>{f}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:10, padding:"12px 16px", marginBottom: 48, fontSize:13, color:T.textMuted }}>
              💡 Example: 50-seat org on Growth = 50 × 50 SAR = 2,500 SAR/month (~$668)
            </div>

            <div style={{ fontSize:11, color:T.textFaint, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:16, fontFamily:"'JetBrains Mono',monospace" }}>Revenue Projections — Targets, Not Actuals</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:48 }}>
              {[
                { year:"Year 1", sar:"~720K SAR", usd:"~$192K", orgs:"10–20 early orgs", note:"PMF in GCC · demo-driven", c:T.green },
                { year:"Year 2", sar:"~3.6M SAR", usd:"~$962K", orgs:"50–80 orgs", note:"Referral + 1 OEM conversation", c:T.purple },
                { year:"Year 3", sar:"~12M SAR", usd:"~$3.2M", orgs:"200+ orgs", note:"OEM licensing · Series A", c:T.blue },
              ].map((f,i) => (
                <div key={i} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:20, borderLeft:`3px solid ${f.c}` }}>
                  <div style={{ fontSize:10, color:T.textFaint, fontFamily:"'JetBrains Mono',monospace", letterSpacing:1.5, marginBottom:8 }}>{f.year}</div>
                  <div style={{ fontSize:26, fontWeight:800, color:f.c }}>{f.sar}</div>
                  <div style={{ fontSize:11, color:T.textFaint, fontFamily:"'JetBrains Mono',monospace", marginTop:2 }}>{f.usd}</div>
                  <div style={{ fontSize:12, color:T.textMid, marginTop:8 }}>{f.orgs}</div>
                  <div style={{ fontSize:11, color:T.textFaint, marginTop:4 }}>{f.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ ARCHITECTURE ══ */}
        {active === "tech" && (
          <div style={{ paddingTop:64, paddingBottom:80 }}>
            <div style={{ marginBottom:48 }}>
              <div style={{ fontSize:11, color:T.textFaint, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:14, fontFamily:"'JetBrains Mono',monospace" }}>Architecture</div>
              <h2 style={{ fontSize:36, fontWeight:800, color:T.text, letterSpacing:"-0.8px", marginBottom:12 }}>Built for serious B2B use.</h2>
              <p style={{ fontSize:15, color:T.textMuted, maxWidth:520, lineHeight:1.7 }}>Tenant isolation, role-ready access control, Supabase RLS compatibility. Service role keys stay on the server where they belong.</p>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:40 }}>
              {[
                { name:"Frontend", c:T.blue, items:["Next.js 14 App Router — SSR + streaming","TypeScript strict — 100% type coverage","Tailwind CSS + shadcn/ui — design system","Zustand + React Query — state management","Recharts / D3.js — performance visualization"] },
                { name:"Backend", c:T.purple, items:["Supabase Postgres 15 — primary database","Row Level Security — org_id isolation at DB layer","Supabase Auth + JWT — multi-tenant sessions","Supabase Realtime — live KPI + JTBD updates","Edge Functions (Deno) — sub-100ms responses"] },
                { name:"AI Layer", c:T.green, items:["Claude 3.5 Sonnet (Anthropic) — primary AI engine","OpenAI GPT-4o — fallback + structured tasks","Anthropic Tool Use — KPI/OKR NL extraction","pgvector — semantic search on performance history","Custom RAG — org-context-aware AI responses"] },
                { name:"Payments — PayTabs", c:T.amber, items:["PayTabs GCC gateway — MADA, Visa, MC, Apple Pay","Recurring Subscription API — seat-based per org","Hosted Page — PCI-DSS compliant checkout","Webhook metering — real-time seat billing events","Multi-currency SAR + USD built in"] },
                { name:"Infrastructure", c:T.textMuted, items:["Vercel Edge — global CDN + zero-downtime deploys","Supabase Cloud multi-region — US, EU, APAC","Multi-tenant: /api/o/[slug]/... routing","PostHog — funnel, retention, feature analytics","Sentry — error monitoring + performance traces"] },
              ].map((layer,i) => (
                <div key={i} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"10px 20px", background:T.surfaceAlt, borderBottom:`1px solid ${T.border}`, display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:layer.c }} />
                    <div style={{ fontSize:12, color:layer.c, fontWeight:700 }}>{layer.name}</div>
                  </div>
                  <div style={{ padding:"14px 20px", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:10 }}>
                    {layer.items.map((item,j) => {
                      const [name,...rest] = item.split(" — ");
                      return (
                        <div key={j} style={{ display:"flex", gap:8 }}>
                          <div style={{ width:3, height:3, borderRadius:"50%", background:layer.c, marginTop:7, flexShrink:0 }} />
                          <div>
                            <div style={{ fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:T.text }}>{name}</div>
                            {rest.length > 0 && <div style={{ fontSize:11, color:T.textFaint, marginTop:2 }}>{rest.join(" — ")}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background:T.codeBg, borderRadius:12, padding:"20px 24px" }}>
              <div style={{ fontSize:10, color:"#484F58", fontFamily:"'JetBrains Mono',monospace", letterSpacing:1.5, marginBottom:12 }}>CORE SCHEMA</div>
              <pre style={{ fontSize:11, color:T.codeText, lineHeight:1.9 }}>{`orgs        (id, slug, name, plan, seat_count, created_at)
users       (id, org_id, role, email)
kpis        (id, org_id, dept_id, name, unit, target, current, direction)
okrs        (id, org_id, objective, quarter)
key_results (id, okr_id, kpi_id, target, current)
jtbds       (id, kr_id, owner_id, status, title)
tasks       (id, jtbd_id, title, assignee_id, done)
ai_insights (id, org_id, kpi_id, severity, root_cause, actions)
billing     (id, org_id, paytabs_sub_id, plan, seats, sar_amount, status)`}</pre>
            </div>
          </div>
        )}

        {/* ══ INVESTOR ══ */}
        {active === "investor" && (
          <div style={{ paddingTop:64, paddingBottom:80 }}>
            <div style={{ marginBottom:48 }}>
              <div style={{ fontSize:11, color:T.textFaint, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:14, fontFamily:"'JetBrains Mono',monospace" }}>Investor Statement</div>
              <h2 style={{ fontSize:36, fontWeight:800, color:T.text, letterSpacing:"-0.8px", marginBottom:12 }}>What ALAMIN is. Honestly.</h2>
              <p style={{ fontSize:15, color:T.textMuted, maxWidth:520, lineHeight:1.7 }}>A live product with real pricing, a real stack, and real potential in an underserved market. No inflated claims.</p>
            </div>

            <div style={{ background:T.amberLight, border:`1px solid ${T.amberBorder}`, borderRadius:10, padding:"14px 18px", marginBottom:36, display:"flex", gap:10 }}>
              <span>⚠️</span>
              <div style={{ fontSize:13, color:T.amber, lineHeight:1.7 }}>
                <strong>Transparency:</strong> This reflects ALAMIN&apos;s actual state in 2025 — a working product in go-to-market phase. Revenue figures are targets, not actuals.
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))", gap:16, marginBottom:48 }}>
              {[
                { icon:"✅", title:"What exists today", c:T.green, bg:T.greenLight, border:T.greenBorder, body:"Working product at alamin-ai.com. Live SAR pricing. Full Next.js + Supabase + AI + PayTabs stack. KPI→OKR→JTBD→Task execution loop. Demo-ready and being sold." },
                { icon:"⚠️", title:"Honest revenue position", c:T.amber, bg:T.amberLight, border:T.amberBorder, body:"Early-stage. No $10M ARR. Revenue projections are targets based on seat-math, not actuals. The product is built. The sales motion is live." },
                { icon:"🔑", title:"Why the IP is real", c:T.purple, bg:T.purpleLight, border:T.purpleBorder, body:"The execution graph, multi-tenant architecture, and AI correction loop represent compounding IP. Cannot be replicated quickly or cheaply." },
                { icon:"🌍", title:"Why now, why GCC", c:T.blue, bg:T.blueLight, border:T.blueBorder, body:"Saudi Vision 2030 mandates performance-driven operations. No AI performance OS exists in SAR-priced, GCC-deployed form. ALAMIN is first." },
              ].map((c,i) => (
                <div key={i} className="dk-card" style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:14, padding:22 }}>
                  <div style={{ fontSize:22, marginBottom:10 }}>{c.icon}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:c.c, marginBottom:8 }}>{c.title}</div>
                  <div style={{ fontSize:13, color:T.textMid, lineHeight:1.75 }}>{c.body}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize:11, color:T.textFaint, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:16, fontFamily:"'JetBrains Mono',monospace" }}>Why an AI company should acquire this</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:48 }}>
              {[
                "Acquire the category before US/EU competitors enter the GCC AI-performance market",
                "Embed as your enterprise execution layer — deployable to customers in under 90 days",
                "Built on Anthropic APIs — any AI company can own this and deepen the layer immediately",
                "SAR billing via PayTabs = regional revenue from day one, no payment rebuild needed",
                "Multi-tenant, RLS-secured — passes enterprise security reviews without architectural changes",
                "Full source code, IP, architecture, and system prompt framework — no black boxes",
                "Sold with complete transparency — no inflated metrics, a real product with real potential",
              ].map((w,i) => (
                <div key={i} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"12px 18px", display:"flex", gap:14 }}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:T.purple, fontWeight:600, flexShrink:0 }}>0{i+1}</div>
                  <div style={{ fontSize:13, color:T.textMid, lineHeight:1.6 }}>{w}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:28, background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:32 }}>
              <div>
                <div style={{ fontSize:10, color:T.textFaint, fontFamily:"'JetBrains Mono',monospace", letterSpacing:1.5, textTransform:"uppercase", marginBottom:14 }}>Deal Structure</div>
                <div style={{ fontSize:28, fontWeight:800, color:T.purple, marginBottom:6 }}>Open to Negotiation</div>
                <div style={{ fontSize:13, color:T.textMid, marginBottom:6 }}>Acquisition · OEM License · Strategic Equity</div>
                <div style={{ fontSize:12, color:T.textFaint, marginBottom:28, lineHeight:1.7 }}>Full acquisition, white-label OEM, strategic equity, or integration partnership.</div>
                <div style={{ fontSize:10, color:T.textFaint, fontFamily:"'JetBrains Mono',monospace", letterSpacing:1.5, textTransform:"uppercase", marginBottom:14 }}>Use of Funds</div>
                {[
                  { label:"Engineering — 2–4 senior hires", pct:45, c:T.purple },
                  { label:"GTM — enterprise sales in GCC", pct:30, c:T.blue },
                  { label:"Infrastructure & SOC2 Type I", pct:15, c:T.green },
                  { label:"Legal, IP, contracts", pct:10, c:T.amber },
                ].map((f,i) => (
                  <div key={i} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, color:T.textMid }}>{f.label}</span>
                      <span style={{ fontSize:11, color:f.c, fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{f.pct}%</span>
                    </div>
                    <div style={{ height:3, background:T.border, borderRadius:2 }}>
                      <div style={{ height:"100%", width:`${f.pct}%`, background:f.c, borderRadius:2, opacity:0.7 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize:10, color:T.textFaint, fontFamily:"'JetBrains Mono',monospace", letterSpacing:1.5, textTransform:"uppercase", marginBottom:16 }}>Honest Milestones</div>
                {[
                  { label:"Today", text:"Live product at alamin-ai.com — demo-ready" },
                  { label:"M3", text:"First 10 paying orgs · OEM LOI signed" },
                  { label:"M6", text:"500K SAR ARR · SOC2 Type I started" },
                  { label:"M12", text:"1.5M SAR ARR · enterprise contract signed" },
                  { label:"M18", text:"Series A ready or acquisition complete" },
                ].map((m,i) => (
                  <div key={i} style={{ display:"flex", gap:12, marginBottom:16 }}>
                    <div style={{ background:T.purpleLight, border:`1px solid ${T.purpleBorder}`, borderRadius:6, padding:"3px 8px", flexShrink:0, height:24, display:"flex", alignItems:"center" }}>
                      <span style={{ fontSize:10, color:T.purple, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{m.label}</span>
                    </div>
                    <div style={{ fontSize:13, color:T.textMid, lineHeight:1.6, paddingTop:2 }}>{m.text}</div>
                  </div>
                ))}
                <div style={{ background:T.purpleLight, border:`1px solid ${T.purpleBorder}`, borderRadius:10, padding:16, marginTop:8 }}>
                  <p style={{ fontSize:13, color:T.purple, lineHeight:1.8, fontStyle:"italic" }}>
                    &ldquo;ALAMIN is not being sold as a unicorn. It is a category-defining product, in the right market, at the right time — built properly, priced honestly.&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      <footer style={{ borderTop:`1px solid ${T.border}`, padding:"20px 40px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <Logo size={20} />
          <span style={{ fontSize:12, color:T.textFaint }}>ALAMIN · AI Performance Intelligence</span>
        </div>
        <span style={{ fontSize:11, color:T.textFaint, fontFamily:"'JetBrains Mono',monospace" }}>© 2026 · alamin-ai.com</span>
      </footer>
    </div>
  );
}
