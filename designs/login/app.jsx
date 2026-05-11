const { useState, useEffect, useRef, useMemo } = React;

// ───────────────────────────── data ─────────────────────────────
const WORKER_MATCHES = [
  { role: 'Site Carpenter', org: 'Bayford Build', loc: 'Manchester', pay: '£220/day', match: 98 },
  { role: 'Registered Nurse', org: 'Mercy NHS Trust', loc: 'Leeds', pay: '£36k', match: 96 },
  { role: 'Sous Chef', org: 'Otto & Pearl', loc: 'Bristol · fine dining', pay: '£32k', match: 94 },
  { role: 'HGV Class 2 Driver', org: 'Northwind Logistics', loc: 'Birmingham', pay: '£18.50/hr', match: 91 },
];

const RECRUITER_MATCHES = [
  { role: 'Marcus T. — Site Carpenter', org: '12 yrs · Gold CSCS', loc: 'Manchester', pay: '£220/day', match: 98 },
  { role: 'Priya R. — Product Designer', org: '9 yrs · ex-Spotify', loc: 'Remote', pay: '£72k', match: 96 },
  { role: 'Daniel K. — Sous Chef', org: '8 yrs · fine dining', loc: 'Bristol', pay: '£32k', match: 94 },
  { role: 'Aisha M. — RN, ICU', org: '6 yrs · NMC verified', loc: 'Leeds', pay: '£36k', match: 92 },
];

const WORKER_SCRIPT = [
  { from: 'ai',    t: 'GigGrab here. What kind of work are you after?' },
  { from: 'user',  t: "I'm a carpenter — 12 years on site. Looking around Manchester." },
  { from: 'ai',    t: 'Got it. Day rate, weekday only, or open to weekends?' },
  { from: 'user',  t: 'Day rate. Weekdays. £200 minimum.' },
  { from: 'ai',    t: "Pulling matches… I have 3 live roles above £200, all within 14 miles." },
];

const RECRUITER_SCRIPT = [
  { from: 'ai',    t: 'GigGrab. What role are you filling today?' },
  { from: 'user',  t: 'Senior Product Designer. Fully remote. Up to £80k.' },
  { from: 'ai',    t: 'Stack preference? B2B, consumer, or agency background?' },
  { from: 'user',  t: 'B2B SaaS, ideally with growth-stage experience.' },
  { from: 'ai',    t: 'Drafting brief. Ranking 412 vetted candidates against it now.' },
];

// ───────────────────────────── icons ─────────────────────────────
const Ico = {
  phone: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  arrow: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>),
  mic: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>),
  globe: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>),
  check: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12l5 5L20 7"/></svg>),
  bolt: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>),
  close: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>),
  arrowRight: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M7 17L17 7M9 7h8v8"/></svg>),
};

// ───────────────────────────── header ─────────────────────────────
function Header() {
  return (
    <header style={{ borderBottom: '1px solid var(--gg-line)', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 40 }}>
      <div className="ggshell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--gg-green)', color: 'white', fontWeight: 800, display: 'grid', placeItems: 'center', letterSpacing: '-0.02em', fontSize: 15 }}>GG</div>
          <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em' }}>GigGrab</div>
        </a>
        <nav style={{ display: 'flex', gap: 32, fontSize: 15, fontWeight: 500, color: 'var(--gg-ink-2)' }}>
          <a href="#">For workers</a>
          <a href="#">For employers</a>
          <a href="#">Pricing</a>
          <a href="#">About</a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="#" style={{ fontSize: 14, fontWeight: 600, color: 'var(--gg-ink-2)' }}>Sign in</a>
          <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: 'var(--gg-ink)', color: 'white', borderRadius: 9, fontSize: 14, fontWeight: 600 }}>
            <Ico.phone width="14" height="14" /> Call now
          </a>
        </div>
      </div>
    </header>
  );
}

// ───────────────────── mode toggle ─────────────────────
function ModeToggle({ mode, setMode }) {
  return (
    <div style={{ display: 'inline-flex', padding: 5, background: 'white', borderRadius: 999, border: '1px solid var(--gg-line)', boxShadow: '0 1px 2px rgba(15,40,25,0.04)' }}>
      {['worker', 'recruiter'].map((m) => {
        const active = mode === m;
        return (
          <button key={m} onClick={() => setMode(m)}
            style={{
              padding: '10px 22px', borderRadius: 999, fontWeight: 600, fontSize: 14,
              background: active ? 'var(--gg-green)' : 'transparent',
              color: active ? 'white' : 'var(--gg-ink-2)',
              transition: 'all 200ms ease',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
            <span style={{ fontSize: 16 }}>{m === 'worker' ? '👷' : '💼'}</span>
            {m === 'worker' ? "I'm looking for work" : "I'm hiring"}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────── phone dialer ─────────────────────
function PhoneDialer({ number, label, onCall, accent }) {
  const digits = number.split('');
  return (
    <div style={{ position: 'relative' }}>
      <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--gg-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#1FCE6A', animation: 'glowDot 1.6s ease-in-out infinite', boxShadow: '0 0 0 3px rgba(31,206,106,0.18)' }}></span>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', lineHeight: 1 }}>
        {digits.map((d, i) => (
          <span key={i} className="mono" style={{
            fontSize: d === ' ' || d === '-' ? 56 : 76,
            fontWeight: 700,
            color: d === ' ' || d === '-' ? 'var(--gg-line-2)' : 'var(--gg-ink)',
            letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}>{d === ' ' ? '·' : d}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
        <a href={`tel:${number.replace(/\s/g,'')}`} onClick={(e)=>{e.preventDefault(); onCall();}}
           style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 24px', background: accent || 'var(--gg-green)', color: 'white', borderRadius: 12, fontWeight: 700, fontSize: 16, boxShadow: '0 8px 24px -8px rgba(14,159,74,0.5)' }}>
          <Ico.phone width="18" height="18" /> Tap to call
        </a>
        <button onClick={onCall} style={{ padding: '16px 22px', borderRadius: 12, fontWeight: 600, fontSize: 15, color: 'var(--gg-ink)', border: '1.5px solid var(--gg-line-2)', background: 'white' }}>
          Call me instead
        </button>
      </div>
    </div>
  );
}

// ───────────────────── live preview side panel ─────────────────────
function LivePreview({ mode, accent }) {
  const matches = mode === 'worker' ? WORKER_MATCHES : RECRUITER_MATCHES;
  const script = mode === 'worker' ? WORKER_SCRIPT : RECRUITER_SCRIPT;
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const t = setInterval(() => setStep((s) => (s + 1) % (script.length + 3)), 1900);
    return () => clearInterval(t);
  }, [mode]);

  const shownMessages = script.slice(0, Math.min(step, script.length));
  const typing = step < script.length;
  const revealed = Math.max(0, Math.min(step - script.length, matches.length));

  return (
    <div style={{ background: 'white', borderRadius: 22, border: '1px solid var(--gg-line)', overflow: 'hidden', boxShadow: '0 20px 60px -30px rgba(14,40,22,0.18), 0 2px 6px rgba(14,40,22,0.04)' }}>
      {/* phone-call header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gg-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--gg-green-tint-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 32, height: 32, borderRadius: '50%', background: accent || 'var(--gg-green)', display: 'grid', placeItems: 'center', color: 'white' }}>
            <Ico.phone width="14" height="14" />
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${accent || 'var(--gg-green)'}`, animation: 'pulseRing 1.8s ease-out infinite' }}></span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Live call · GigGrab AI</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--gg-muted)' }}>00:47 · 🎙 listening</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28 }}>
          {[0,1,2,3,4].map((i) => (
            <span key={i} style={{ width: 3, background: accent || 'var(--gg-green)', borderRadius: 2, animation: `wave 1s ease-in-out infinite`, animationDelay: `${i*0.12}s` }}></span>
          ))}
        </div>
      </div>

      {/* transcript */}
      <div style={{ padding: '18px 18px 4px 18px', maxHeight: 240, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shownMessages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.from === 'ai' ? 'flex-start' : 'flex-end', animation: 'slideUp 320ms ease' }}>
            <div style={{
              maxWidth: '82%',
              background: m.from === 'ai' ? 'var(--gg-green-tint)' : 'var(--gg-ink)',
              color: m.from === 'ai' ? 'var(--gg-green-deep)' : 'white',
              padding: '9px 13px',
              borderRadius: 14,
              borderBottomLeftRadius: m.from === 'ai' ? 4 : 14,
              borderBottomRightRadius: m.from === 'user' ? 4 : 14,
              fontSize: 13.5, lineHeight: 1.4, fontWeight: 500,
            }}>{m.t}</div>
          </div>
        ))}
        {typing && (
          <div style={{ display: 'flex', gap: 4, padding: '6px 12px', background: 'var(--gg-green-tint)', borderRadius: 14, alignSelf: 'flex-start', borderBottomLeftRadius: 4 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gg-green)', animation: 'typing 1.1s ease-in-out infinite', animationDelay: `${i*0.15}s` }}></span>)}
          </div>
        )}
      </div>

      {/* match feed */}
      <div style={{ padding: '14px 18px 18px', borderTop: '1px solid var(--gg-line)', marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{mode === 'worker' ? 'Live matches' : 'Top vetted candidates'}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--gg-green-dark)', background: 'var(--gg-green-tint)', padding: '3px 8px', borderRadius: 999, fontWeight: 600 }}>{revealed} new</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matches.slice(0, 3).map((m, i) => (
            <div key={i} style={{
              padding: '11px 13px', borderRadius: 12, border: '1px solid var(--gg-line)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              opacity: i < revealed ? 1 : 0.2,
              transform: i < revealed ? 'translateY(0)' : 'translateY(4px)',
              transition: 'all 400ms ease',
              background: i < revealed ? 'white' : 'var(--gg-bg)',
            }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.role}</div>
                <div style={{ fontSize: 12, color: 'var(--gg-muted)', marginTop: 1 }}>{m.org} · {m.loc} · {m.pay}</div>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gg-green-dark)', background: 'var(--gg-green-tint)', padding: '4px 8px', borderRadius: 8 }}>{m.match}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────── callback modal ─────────────────────
function CallbackModal({ open, onClose, mode }) {
  const [phase, setPhase] = useState('form');
  const [number, setNumber] = useState('+44 ');
  const [name, setName] = useState('');
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!open) { setPhase('form'); setSecs(0); return; }
  }, [open]);

  useEffect(() => {
    if (phase === 'ringing') {
      const t = setTimeout(() => setPhase('connected'), 2400);
      return () => clearTimeout(t);
    }
    if (phase === 'connected') {
      const t = setInterval(() => setSecs(s => s + 1), 1000);
      return () => clearInterval(t);
    }
  }, [phase]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(8,20,12,0.55)', backdropFilter: 'blur(6px)',
      zIndex: 100, display: 'grid', placeItems: 'center', padding: 24, animation: 'slideUp 220ms ease',
    }}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        width: 'min(440px, 100%)', background: 'white', borderRadius: 22, padding: 28,
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.35)', position: 'relative',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 8, color: 'var(--gg-muted)' }}>
          <Ico.close width="16" height="16" />
        </button>

        {phase === 'form' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--gg-green-tint)', display: 'grid', placeItems: 'center', color: 'var(--gg-green-dark)', marginBottom: 16 }}>
              <Ico.phone width="22" height="22" />
            </div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>We'll call you in 10 seconds</h2>
            <p style={{ margin: '8px 0 22px', color: 'var(--gg-muted)', fontSize: 14.5, lineHeight: 1.5 }}>
              {mode === 'worker'
                ? "Pop in your number. Our AI will ring you, ask a few questions, and match you to live roles — in any language."
                : "Pop in your number. Our AI will ring you, take the brief, then send you ranked candidates within the hour."}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" style={inputCss} />
              <input value={number} onChange={(e)=>setNumber(e.target.value)} placeholder="+44 7700 900 000" style={{ ...inputCss, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }} />
            </div>
            <button onClick={()=>setPhase('ringing')} disabled={!number || number.length < 6}
              style={{
                marginTop: 16, width: '100%', padding: '14px', borderRadius: 12,
                background: 'var(--gg-green)', color: 'white', fontWeight: 700, fontSize: 15,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: (!number || number.length < 6) ? 0.4 : 1,
              }}>
              <Ico.phone width="16" height="16" /> Call me now
            </button>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--gg-muted)', textAlign: 'center' }}>Free · No card · 2-minute call</div>
          </>
        )}

        {phase === 'ringing' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 22px' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--gg-green)', display: 'grid', placeItems: 'center', color: 'white' }}>
                <Ico.phone width="36" height="36" />
              </div>
              {[0,1,2].map(i => <span key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--gg-green)', animation: 'pulseRing 1.8s ease-out infinite', animationDelay: `${i*0.5}s` }}></span>)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Ringing {name || 'you'}…</div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--gg-muted)', marginTop: 6 }}>{number}</div>
          </div>
        )}

        {phase === 'connected' && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ position: 'relative', width: 44, height: 44, borderRadius: '50%', background: 'var(--gg-green)', display: 'grid', placeItems: 'center', color: 'white' }}>
                <Ico.phone width="18" height="18" />
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Connected to GigGrab AI</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--gg-muted)' }}>{String(Math.floor(secs/60)).padStart(2,'0')}:{String(secs%60).padStart(2,'0')} · 🎙 live</div>
              </div>
            </div>
            <div style={{ background: 'var(--gg-green-tint)', borderRadius: 14, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--gg-green-deep)', borderBottomLeftRadius: 4 }}>
              {mode === 'worker' ? 'Hi! GigGrab here. What kind of work are you looking for?' : 'Hi! GigGrab here. What role are you trying to fill?'}
            </div>
            <button onClick={onClose} style={{ marginTop: 18, width: '100%', padding: 12, borderRadius: 12, background: '#E63946', color: 'white', fontWeight: 700 }}>
              End demo call
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
const inputCss = {
  width: '100%', padding: '12px 14px', border: '1.5px solid var(--gg-line-2)',
  borderRadius: 10, fontSize: 15, fontFamily: 'inherit', outline: 'none',
};

// ───────────────────── hero ─────────────────────
function Hero({ mode, setMode, t, onCall }) {
  const isWorker = mode === 'worker';
  const number = '+1 551 553 4910';
  const headline = isWorker
    ? (t.workerHeadline || 'Call this number.\nGet a job today.')
    : (t.recruiterHeadline || 'Call this number.\nWe staff your role.');
  const sub = isWorker
    ? "No CV. No forms. Talk to our AI for 2 minutes — in any language — and we'll match you to live jobs in your field."
    : "No long briefs. No coffees. Talk to our AI for 5 minutes — we'll write the JD, search vetted talent, and send you ranked candidates within the hour.";

  return (
    <section style={{ background: `linear-gradient(180deg, var(--gg-green-tint-2) 0%, var(--gg-bg) 80%)`, position: 'relative', overflow: 'hidden' }}>
      {/* faint diagonal pattern */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.5, background: 'repeating-linear-gradient(135deg, transparent 0, transparent 60px, rgba(14,159,74,0.04) 60px, rgba(14,159,74,0.04) 61px)' }}></div>

      <div className="ggshell" style={{ position: 'relative', padding: '36px 32px 80px' }}>
        {/* mode toggle, centered top */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>

        {/* main row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 64, alignItems: 'center' }}>
          <div>
            {/* eyebrow */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'white', border: '1px solid var(--gg-line)', borderRadius: 999, fontSize: 12.5, fontWeight: 600, color: 'var(--gg-green-dark)', marginBottom: 22 }}>
              <Ico.bolt width="13" height="13" />
              <span className="mono" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{isWorker ? 'Voice-first hiring hotline' : 'Recruiter hotline · vetted pool'}</span>
            </div>

            {/* hotline card with phone number HERO */}
            <div style={{ background: 'white', borderRadius: 24, padding: '32px 36px', border: '1px solid var(--gg-line)', boxShadow: '0 30px 80px -50px rgba(14,40,22,0.25), 0 2px 6px rgba(14,40,22,0.04)', marginBottom: 32 }}>
              <PhoneDialer number={number} label={isWorker ? '24/7 Worker Hotline' : '24/7 Recruiter Hotline'} onCall={onCall} />
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--gg-line-2)', display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 13, color: 'var(--gg-muted)', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico.globe width="14" height="14" color="var(--gg-green-dark)" /> 32 languages</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico.check width="14" height="14" color="var(--gg-green-dark)" /> Free to call</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico.bolt width="14" height="14" color="var(--gg-green-dark)" /> Avg. {isWorker ? '2-min' : '5-min'} intake</span>
              </div>
            </div>

            {/* headline + sub */}
            <h1 style={{
              fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800, letterSpacing: '-0.035em',
              lineHeight: 1.02, margin: '0 0 18px', whiteSpace: 'pre-line',
            }}>
              {headline.split('\n').map((line, i) => (
                <span key={i} style={{ display: 'block', color: i === 0 ? 'var(--gg-ink)' : 'var(--gg-green)' }}>{line}</span>
              ))}
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--gg-ink-2)', maxWidth: 540, margin: 0 }}>{sub}</p>
          </div>

          <div>
            <LivePreview mode={mode} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────── steps ─────────────────────
function Steps({ mode }) {
  const steps = mode === 'worker' ? [
    { n: '01', icon: <Ico.phone width="20" height="20"/>, title: 'Dial the hotline', body: 'Call from any phone, in any country. Free.' },
    { n: '02', icon: <Ico.mic width="20" height="20"/>, title: 'Talk for 2 minutes', body: 'Tell our AI what you do, where, and when — in your language.' },
    { n: '03', icon: <Ico.bolt width="20" height="20"/>, title: 'Get matched live', body: 'We text + email ranked roles you can apply to with one tap.' },
  ] : [
    { n: '01', icon: <Ico.phone width="20" height="20"/>, title: 'Dial the hotline', body: 'Call when you have a role. Free, 24/7.' },
    { n: '02', icon: <Ico.mic width="20" height="20"/>, title: 'Brief us by voice', body: 'Walk through the role naturally. We turn it into a structured JD.' },
    { n: '03', icon: <Ico.bolt width="20" height="20"/>, title: 'Receive ranked candidates', body: 'Top vetted talent in your inbox within the hour. Auto-interviews on request.' },
  ];

  return (
    <section style={{ borderTop: '1px solid var(--gg-line)', padding: '80px 0' }}>
      <div className="ggshell">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 36, flexWrap: 'wrap', gap: 18 }}>
          <div>
            <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--gg-green-dark)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>How the hotline works</div>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>One call. Three steps.</h2>
          </div>
          <div style={{ color: 'var(--gg-muted)', fontSize: 15, maxWidth: 380, lineHeight: 1.5 }}>
            {mode === 'worker' ? 'No app to download. No CV to upload. Just the phone in your pocket.' : 'No platform login. No long briefs. Just a quick voice call.'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ position: 'relative', padding: 28, borderRadius: 18, background: 'white', border: '1px solid var(--gg-line)', overflow: 'hidden' }}>
              <div className="mono" style={{ fontSize: 13, color: 'var(--gg-muted)', fontWeight: 600 }}>{s.n}</div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gg-green-tint)', color: 'var(--gg-green-dark)', display: 'grid', placeItems: 'center', margin: '16px 0 16px' }}>{s.icon}</div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6 }}>{s.title}</div>
              <div style={{ color: 'var(--gg-muted)', fontSize: 14.5, lineHeight: 1.5 }}>{s.body}</div>
              {i < 2 && (
                <div style={{ position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)', color: 'var(--gg-line-2)', display: 'none' }}>
                  <Ico.arrow width="28" height="28" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────── stats / proof ─────────────────────
function Proof({ mode }) {
  const stats = mode === 'worker'
    ? [
        { n: '12,400+', l: 'Live jobs right now' },
        { n: '< 2 min', l: 'Avg. call length' },
        { n: '32', l: 'Languages supported' },
        { n: '94%', l: 'Match in under a day' },
      ]
    : [
        { n: '4,800+', l: 'Vetted candidates' },
        { n: '< 1 hr', l: 'First shortlist' },
        { n: '8 ATS', l: 'Integrations (Ashby, GH, …)' },
        { n: '£0', l: 'Until you hire' },
      ];

  return (
    <section style={{ background: 'var(--gg-ink)', color: 'white', padding: '64px 0' }}>
      <div className="ggshell" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
        {stats.map((s, i) => (
          <div key={i}>
            <div className="mono" style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'white' }}>{s.n}</div>
            <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: 500 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ───────────────────── final CTA ─────────────────────
function FinalCTA({ mode, onCall }) {
  const isWorker = mode === 'worker';
  const number = '+1 551 553 4910';
  return (
    <section style={{ padding: '80px 0', background: 'var(--gg-green)', color: 'white', position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.18, background: 'radial-gradient(circle at 20% 50%, white 0%, transparent 35%), radial-gradient(circle at 80% 30%, white 0%, transparent 30%)' }}></div>
      <div className="ggshell" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.2fr 1fr', alignItems: 'center', gap: 48 }}>
        <div>
          <div className="mono" style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 12 }}>Ready when you are</div>
          <h2 style={{ fontSize: 'clamp(36px, 4.5vw, 56px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0 }}>
            {isWorker ? 'Pick up your phone.\nGet a job.' : 'Pick up your phone.\nFill the role.'}
          </h2>
          <div style={{ marginTop: 24, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <a href={`tel:${number}`} onClick={(e)=>{e.preventDefault(); onCall();}}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 24px', background: 'white', color: 'var(--gg-green-dark)', borderRadius: 12, fontWeight: 700, fontSize: 16 }}>
              <Ico.phone width="18" height="18" /> Call {number}
            </a>
            <button onClick={onCall} style={{ padding: '16px 22px', borderRadius: 12, fontWeight: 600, fontSize: 15, color: 'white', border: '1.5px solid rgba(255,255,255,0.4)' }}>
              Have us call you
            </button>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 22, padding: 28 }}>
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }} className="mono">QUICK FACT</div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
            {isWorker
              ? "94% of callers get their first match before they hang up — read out by our AI, live on the call."
              : "Recruiters who brief by voice fill roles 3.2× faster than via job-board posts."}
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────── footer ─────────────────────
function Footer() {
  const cols = [
    { h: 'Product', l: ['For workers', 'For employers', 'Pricing', 'ATS integrations'] },
    { h: 'Company', l: ['About', 'Careers', 'Press', 'Contact'] },
    { h: 'Legal', l: ['Privacy', 'Terms', 'Cookies', 'Modern Slavery'] },
  ];
  return (
    <footer style={{ borderTop: '1px solid var(--gg-line)', background: 'white', padding: '60px 0 32px' }}>
      <div className="ggshell" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 40 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--gg-green)', color: 'white', fontWeight: 800, display: 'grid', placeItems: 'center' }}>GG</div>
            <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em' }}>GigGrab</div>
          </div>
          <p style={{ color: 'var(--gg-muted)', fontSize: 14, lineHeight: 1.55, maxWidth: 280, margin: 0 }}>Voice-first hiring hotline. We match vetted workers to live roles — in any language.</p>
        </div>
        {cols.map((c, i) => (
          <div key={i}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{c.h}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.l.map((x, j) => <a key={j} href="#" style={{ color: 'var(--gg-muted)', fontSize: 14 }}>{x}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div className="ggshell" style={{ marginTop: 48, paddingTop: 22, borderTop: '1px solid var(--gg-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--gg-muted)' }}>
        <span>© 2026 GigGrab Ltd. All rights reserved.</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico.globe width="14" height="14" /> English (UK)</span>
      </div>
    </footer>
  );
}

// ───────────────────── tweaks panel content ─────────────────────
function Tweaks({ t, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection title="Hotline headline (worker)">
        <TweakText value={t.workerHeadline} onChange={(v)=>setTweak('workerHeadline', v)} multiline />
      </TweakSection>
      <TweakSection title="Hotline headline (recruiter)">
        <TweakText value={t.recruiterHeadline} onChange={(v)=>setTweak('recruiterHeadline', v)} multiline />
      </TweakSection>
      <TweakSection title="Accent palette">
        <TweakColor
          value={t.accent}
          onChange={(v)=>setTweak('accent', v)}
          options={['#0E9F4A','#0A7A38','#0D6E8C','#C9482E','#1B2A33']}
        />
      </TweakSection>
      <TweakSection title="Hero layout">
        <TweakRadio
          value={t.layout}
          onChange={(v)=>setTweak('layout', v)}
          options={[
            { value: 'split', label: 'Split' },
            { value: 'stack', label: 'Stacked' },
          ]}
        />
      </TweakSection>
      <TweakSection title="Headline tone">
        <TweakSelect
          value={t.tone}
          onChange={(v)=>setTweak('tone', v)}
          options={[
            { value: 'direct', label: 'Direct ("Call this number. Get a job.")' },
            { value: 'punchy', label: 'Punchy ("Dial. Talk. Hired.")' },
            { value: 'human', label: 'Human ("Skip the form. Just call.")' },
            { value: 'classic', label: 'Classic ("Speak. Match. Get hired.")' },
          ]}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

const TONES = {
  direct:  { worker: 'Call this number.\nGet a job today.', recruiter: 'Call this number.\nWe staff your role.' },
  punchy:  { worker: 'Dial.\nTalk. Hired.', recruiter: 'Dial.\nBrief. Hired.' },
  human:   { worker: "Skip the form.\nJust call us.", recruiter: "Skip the brief.\nJust call us." },
  classic: { worker: 'Speak it.\nGet hired.', recruiter: 'Speak it.\nFill it.' },
};

// ───────────────────── app ─────────────────────
function App() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "workerHeadline": "Call this number.\nGet a job today.",
    "recruiterHeadline": "Call this number.\nWe staff your role.",
    "accent": "#0E9F4A",
    "layout": "split",
    "tone": "direct"
  }/*EDITMODE-END*/;

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [mode, setMode] = useState('worker');
  const [modal, setModal] = useState(false);

  // apply tone preset → also push synced headlines
  useEffect(() => {
    const preset = TONES[t.tone];
    if (preset) {
      if (preset.worker !== t.workerHeadline || preset.recruiter !== t.recruiterHeadline) {
        setTweak({ workerHeadline: preset.worker, recruiterHeadline: preset.recruiter });
      }
    }
  }, [t.tone]);

  // apply accent globally
  useEffect(() => {
    document.documentElement.style.setProperty('--gg-green', t.accent);
  }, [t.accent]);

  return (
    <>
      <Header />
      <main>
        <Hero mode={mode} setMode={setMode} t={t} onCall={()=>setModal(true)} />
        <Steps mode={mode} />
        <Proof mode={mode} />
        <FinalCTA mode={mode} onCall={()=>setModal(true)} />
      </main>
      <Footer />
      <CallbackModal open={modal} onClose={()=>setModal(false)} mode={mode} />
      <Tweaks t={t} setTweak={setTweak} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
