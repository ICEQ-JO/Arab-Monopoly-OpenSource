import { useEffect, useState } from "react";
import { socket } from "../socket";
import ThemeToggle from "./ThemeToggle";

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
export default function Lobby({ onJoined, theme, onToggleTheme }) {
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
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
                Create Room
              </button>
              <button
                className="lobby-btn-secondary"
                disabled={!canProceedIdentity}
                onClick={() => go("join")}
              >
                Join Room
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
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
              Join Room
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
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
              Create Room
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
