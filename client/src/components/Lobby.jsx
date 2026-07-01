import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

const QUOTES = [
  { text: "الناس من خوف الذل في ذل", author: "المتنبي" },
  { text: "إذا كنت ذا رأي فكن ذا عزيمة، فإن فساد الرأي أن تترددا", author: "المتنبي" },
  { text: "أعظم الناس قدراً من لا يرى قدره، وأكبر الناس فضلاً من لا يرى فضله", author: "عمر بن الخطاب" },
  { text: "لا يهزم الحق إذا كان معك صاحبه", author: "صلاح الدين الأيوبي" },
  { text: "الجيش الذي لا يأكل لن يُقاتل، والجيش الذي يأكل جيد يُقاتل جيداً", author: "خالد بن الوليد" },
  { text: "النصر صبر ساعة", author: "صلاح الدين الأيوبي" },
  { text: "من استعجل شيئاً قبل أوانه عوقب بحرمانه", author: "عمر بن الخطاب" },
  { text: "إذا هبت ريح النصر فاركب موجتها", author: "خالد بن الوليد" },
  { text: "الجهل موت الأحياء", author: "علي بن أبي طالب" },
  { text: "قيمة كل امرئ ما يُحسنه", author: "علي بن أبي طالب" },
  { text: "من أراد الدنيا فعليه بالعلم، ومن أراد الآخرة فعليه بالعلم", author: "الإمام الشافعي" },
  { text: "لا تُسرف في شيء إلا في طلب العلم", author: "ابن تيمية" },
];

const QUOTE_DURATION = 5000;
const FADE_DURATION  = 500;

// Steps: 'landing' → 'create-mode' → done (color and rules are picked once
//        inside the room, not here)
//        'landing' → 'join'
export default function Lobby({ onJoined }) {
  // Quote cycling
  const [quoteIdx,  setQuoteIdx]  = useState(0);
  const [fading,    setFading]    = useState(false);

  // Step
  const [step, setStep] = useState("landing"); // 'landing'|'create-mode'|'join'

  // Shared identity
  const [name,  setName]  = useState("");

  // Join-specific
  const [code, setCode] = useState("");

  // UI state
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [muted, setMuted] = useState(true);

  // Audio
  const audioCtxRef = useRef(null);
  const nodesRef    = useRef(null);

  function buildAmbience(ctx) {
    const master = ctx.createGain(); master.gain.value = 0.72; master.connect(ctx.destination);
    const convolver = ctx.createConvolver();
    const irLen = ctx.sampleRate * 2.2;
    const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.4);
    }
    convolver.buffer = irBuf; convolver.connect(master);
    const dry = ctx.createGain(); dry.gain.value = 0.55; dry.connect(master);
    const wet = ctx.createGain(); wet.gain.value = 0.45; wet.connect(convolver);
    const Hz = [146.83,155.56,185.00,196.00,220.00,233.08,277.18,293.66,369.99,392.00,440.00];
    const phrases = [[0,2,3,4,3,2,0],[4,5,6,4,3,2,0],[0,1,2,3,2,1,0],[2,3,4,6,4,3,2],[0,3,4,3,0],[4,6,8,9,8,6,4]];
    let running = true, phraseIdx = 0;
    function pluck(freq, when, vol = 0.18) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = "triangle"; o2.type = "sawtooth"; o1.frequency.value = freq; o2.frequency.value = freq * 1.002;
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(freq * 8, when);
      f.frequency.exponentialRampToValueAtTime(freq * 1.5, when + 1.4); f.Q.value = 1.2;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, when); env.gain.linearRampToValueAtTime(vol, when + 0.012);
      env.gain.exponentialRampToValueAtTime(vol * 0.35, when + 0.18); env.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
      o1.connect(f); o2.connect(f); f.connect(env); env.connect(dry); env.connect(wet);
      o1.start(when); o1.stop(when + 1.65); o2.start(when); o2.stop(when + 1.65);
    }
    const droneOsc = ctx.createOscillator(); droneOsc.type = "sine"; droneOsc.frequency.value = 73.42;
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.09;
    droneOsc.connect(droneGain); droneGain.connect(wet); droneOsc.start();
    function schedulePhrase() {
      if (!running) return;
      const phrase = phrases[phraseIdx++ % phrases.length];
      const noteDur = 0.52 + Math.random() * 0.28; let t = ctx.currentTime + 0.05;
      for (const idx of phrase) { pluck(Hz[idx], t, 0.14 + Math.random() * 0.06); t += noteDur; }
      setTimeout(schedulePhrase, (phrase.length * noteDur + 1.2 + Math.random() * 1.3) * 1000);
    }
    schedulePhrase();
    return { droneOsc, stop: () => { running = false; droneOsc.stop(); } };
  }

  function startAmbience() {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx; nodesRef.current = buildAmbience(ctx);
  }
  function stopAmbience() {
    if (!audioCtxRef.current) return;
    try { nodesRef.current?.stop?.(); } catch (_) {}
    audioCtxRef.current.close(); audioCtxRef.current = null; nodesRef.current = null;
  }
  function toggleSound() {
    if (muted) { startAmbience(); setMuted(false); }
    else        { stopAmbience();  setMuted(true);  }
  }

  useEffect(() => () => stopAmbience(), []);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => { setQuoteIdx((i) => (i + 1) % QUOTES.length); setFading(false); }, FADE_DURATION);
    }, QUOTE_DURATION);
    return () => clearInterval(timer);
  }, []);

  // ── Helpers ──────────────────────────────────────────────────
  const canProceedIdentity = name.trim();

  function createRoom() {
    if (!name.trim()) return setError("Enter your name first");
    setBusy(true);
    socket.emit("createRoom", { name: name.trim() }, (res) => {
      setBusy(false);
      if (res?.error) return setError(res.error);
      onJoined(res);
    });
  }

  function joinRoom() {
    if (!name.trim())  return setError("Enter your name first");
    if (!code.trim())  return setError("Enter a room code");
    setBusy(true);
    socket.emit("joinRoom", { code: code.trim(), name: name.trim() }, (res) => {
      setBusy(false);
      if (res?.error) return setError(res.error);
      onJoined(res);
    });
  }

  function go(nextStep) { setError(""); setStep(nextStep); }

  // ── Step content ─────────────────────────────────────────────

  function renderIdentitySection() {
    return (
      <div className="lobby-input-group">
        <label className="lobby-input-label">Your Name *</label>
        <input
          className="lobby-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="Enter your name…"
          maxLength={20}
        />
      </div>
    );
  }

  // ── Landing step ─────────────────────────────────────────────
  if (step === "landing") {
    return (
      <div className="lobby">
        <SoundToggle muted={muted} onToggle={toggleSound} />
        <Credits />

        <div className="lobby-content">
          <div className="lobby-title-float">
            <Ornament />
            <h1 className="lobby-game-title">Monoboly عرب</h1>
            <p className="lobby-subtitle">A property-trading board game for friends, online.</p>
            <Ornament />
          </div>

          <div className={`lobby-quote-display${fading ? " fading" : ""}`}>
            <span className="lobby-quote-text">"{QUOTES[quoteIdx].text}"</span>
            <span className="lobby-quote-author">— {QUOTES[quoteIdx].author}</span>
          </div>

          <div className="lobby-form-card visible">
            {renderIdentitySection()}

            {error && <p className="lobby-error">{error}</p>}

            <div className="lobby-action-row">
              <button
                className="lobby-btn-primary"
                disabled={!canProceedIdentity}
                onClick={() => go("create-mode")}
              >
                <span className="lobby-btn-icon">🏰</span> Create Room
              </button>
              <button
                className="lobby-btn-secondary"
                disabled={!canProceedIdentity}
                onClick={() => go("join")}
              >
                <span className="lobby-btn-icon">🚪</span> Join Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Join step ─────────────────────────────────────────────────
  if (step === "join") {
    return (
      <div className="lobby">
        <SoundToggle muted={muted} onToggle={toggleSound} />
        <Credits />
        <div className="lobby-content">
          <div className="lobby-title-float">
            <Ornament />
            <h1 className="lobby-game-title">Monoboly عرب</h1>
            <Ornament />
          </div>
          <div className="lobby-form-card visible">
            <WizardHeader step={1} total={1} title="Join a Room" onBack={() => go("landing")} />

            <div className="lobby-input-group">
              <label className="lobby-input-label">Room Code</label>
              <input
                className="lobby-input lobby-input-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB12CD"
                maxLength={8}
              />
            </div>

            {error && <p className="lobby-error">{error}</p>}

            <button className="lobby-btn-primary" disabled={busy || !canProceedIdentity} onClick={joinRoom}>
              <span className="lobby-btn-icon">🚪</span> Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Create: Mode step ─────────────────────────────────────────
  if (step === "create-mode") {
    return (
      <div className="lobby">
        <SoundToggle muted={muted} onToggle={toggleSound} />
        <Credits />
        <div className="lobby-content">
          <div className="lobby-title-float">
            <Ornament />
            <h1 className="lobby-game-title">Monoboly عرب</h1>
            <Ornament />
          </div>
          <div className="lobby-form-card visible">
            <WizardHeader step={1} total={1} title="Choose Game Mode" onBack={() => go("landing")} />

            <div className="mode-picker">
              <button className="mode-btn active">⚔ Normal</button>
              <button className="mode-btn mode-btn-disabled" disabled title="Coming soon">
                ★ Characters <span className="mode-btn-soon-banner">Coming Soon</span>
              </button>
            </div>

            <p className="lobby-mode-desc">
              Classic property trading — pick your color and rules once you're in the room.
            </p>

            {error && <p className="lobby-error">{error}</p>}

            <button className="lobby-btn-primary" disabled={busy} onClick={createRoom}>
              <span className="lobby-btn-icon">🏰</span> Create Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────

function Ornament() {
  return (
    <div className="lobby-ornament">
      <span className="lobby-ornament-line" />
      <span className="lobby-ornament-diamond">◆</span>
      <span className="lobby-ornament-line" />
    </div>
  );
}

function Credits() {
  return (
    <div className="lobby-credits">
      <span className="lobby-credits-label">Made by</span>
      <span className="lobby-credits-name">Khalid Khudari</span>
      <span className="lobby-credits-name">Mohamad Muhaisen</span>
      <span className="lobby-credits-name">Ameen Alrawabdeh</span>
    </div>
  );
}

function SoundToggle({ muted, onToggle }) {
  return (
    <button className="sound-toggle" onClick={onToggle} title={muted ? "Play music" : "Stop music"}>
      {muted ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      )}
    </button>
  );
}

function WizardHeader({ step, total, title, onBack }) {
  return (
    <div className="wizard-header">
      <button className="wizard-back-btn" onClick={onBack}>← Back</button>
      <div className="wizard-title-block">
        <span className="wizard-step-label">Step {step} of {total}</span>
        <span className="wizard-title">{title}</span>
      </div>
      <div className="wizard-dots">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`wizard-dot${i < step ? " active" : ""}`} />
        ))}
      </div>
    </div>
  );
}
