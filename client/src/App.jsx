import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { loadSession, saveSession, clearSession } from "./session";
import { getStoredTheme, applyTheme } from "./theme";
import Lobby from "./components/Lobby";
import BoardClassic from "./components/BoardClassic";
import PlayersPanel from "./components/PlayersPanel";
import MyProperties from "./components/MyProperties";
import OpenTrades from "./components/OpenTrades";
import GameLog from "./components/GameLog";
import TradeModal from "./components/TradeModal";
import AuctionModal from "./components/AuctionModal";
import DevTools from "./components/DevTools";
import RulesPanel from "./components/RulesPanel";
import IconPicker from "./components/IconPicker";
import ThemeToggle from "./components/ThemeToggle";
import { IconCopy, IconCheck } from "./components/icons";
import { ICONS } from "./data/icons";
import { playTradePopup, playTradeAccepted, playTradeDeclined, playBoughtTile } from "./sfx";
import "./App.css";

// Eagerly fetches every player-icon image the instant this module loads --
// well before a player ever reaches the waitroom's IconPicker -- so they're
// already decoded and cached instead of visibly popping in over the network
// the first time that picker (or a board token wearing one) renders.
ICONS.forEach((icon) => {
  const img = new Image();
  img.src = icon.img;
});

function App() {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [rejoining, setRejoining] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [startError, setStartError] = useState("");
  const [theme, setTheme] = useState(getStoredTheme);
  const [codeCopied, setCodeCopied] = useState(false);
  // Whether the current turn's token is still gliding to its destination
  // tile -- lifted out of BoardClassic so CardReveal can hold off popping up
  // a drawn Surprise/Treasure card until the token has actually landed.
  const [tokenMoving, setTokenMoving] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Tracks each player's last-known position so an incoming "state" broadcast
  // that moves someone can flip tokenMoving to true in the SAME render as the
  // new position/card data (see handleState below). BoardClassic's own glide
  // effect detects the same move independently to drive the visual animation
  // and flips tokenMoving back to false once the token actually lands
  // (via onTokenMovingChange) -- this ref only needs to catch the leading
  // edge early enough that CardReveal never sees the new card before
  // tokenMoving is already true, which a purely effect-driven flag (set one
  // render after the state update lands) was consistently one render late for.
  const prevMovePositionsRef = useRef(new Map());

  // Chimes for everyone in the room the instant any new trade offer shows up
  // in state.trades, not just its recipient. seenTradeIdsRef starts empty and
  // gets bulk-seeded (no sound) the first time state+myId are both
  // available, so trades that already existed before this session started
  // watching (e.g. on rejoin) don't retroactively trigger the chime -- only
  // genuinely new ones after that do.
  const seenTradeIdsRef = useRef(new Set());
  const tradesSeededRef = useRef(false);
  useEffect(() => {
    if (!state || !myId) return;
    const trades = state.trades || [];
    const seen = seenTradeIdsRef.current;
    if (!tradesSeededRef.current) {
      trades.forEach((t) => seen.add(t.id));
      tradesSeededRef.current = true;
      return;
    }
    let hasNewTrade = false;
    trades.forEach((t) => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      hasNewTrade = true;
    });
    if (hasNewTrade) playTradePopup();
  }, [state, myId]);

  // Clears a stale "every player must choose an icon" start-game error the
  // moment that stops being true (e.g. the last holdout finally picks one),
  // instead of leaving it on screen until the host clicks Start again.
  useEffect(() => {
    if (!state || !startError) return;
    if (state.players.every((p) => p.icon)) setStartError("");
  }, [state, startError]);

  // Accept/decline and buying a tile have no dedicated socket event of their
  // own that reaches every client (respondTrade/buyProperty only call back
  // the player who acted) -- the game log entry each one pushes server-side
  // is the one signal every client in the room actually receives, so that's
  // what gets watched here instead. lastLogRef seeds silently on the first
  // state a client sees (so joining mid-game doesn't replay a sound for
  // whatever happens to already be the newest entry), then compares only the
  // newest line on each update after that.
  const lastLogRef = useRef(undefined);
  useEffect(() => {
    if (!state) return;
    const newest = (state.log || [])[0];
    const prev = lastLogRef.current;
    lastLogRef.current = newest;
    if (prev === undefined || newest === undefined || newest === prev) return;
    if (newest.includes("completed a trade.")) playTradeAccepted();
    else if (newest.includes("declined") && newest.includes("trade offer")) playTradeDeclined();
    else if (newest.includes(" bought ")) playBoughtTile();
  }, [state]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  async function copyRoomCode() {
    const code = state.code;
    try {
      // navigator.clipboard is only defined in secure contexts (https, or
      // localhost) -- testing over a plain-http LAN IP (common when trying
      // multiplayer from another device) leaves it undefined, and calling
      // .writeText on it throws synchronously rather than rejecting, which
      // silently broke the button with no fallback and no visible error.
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("clipboard API unavailable");
      await navigator.clipboard.writeText(code);
    } catch {
      // Legacy fallback: select the code in an offscreen textarea and use
      // the old execCommand copy path, which works without the secure-
      // context restriction.
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try { document.execCommand("copy"); } catch { /* nothing more we can do */ }
      document.body.removeChild(textarea);
    }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  useEffect(() => {
    function attemptRejoin() {
      const session = loadSession();
      if (!session) return;
      setRejoining(true);
      socket.emit("rejoinRoom", session, (res) => {
        setRejoining(false);
        if (res?.error) {
          clearSession();
          return;
        }
        setMyId(res.playerId);
        setJoined(true);
      });
    }

    function handleConnect() {
      attemptRejoin();
    }
    function handleDisconnect() {}
    function handleState(s) {
      const prevPositions = prevMovePositionsRef.current;
      let moved = false;
      (s.players || []).forEach((p) => {
        const prev = prevPositions.get(p.id);
        if (prev !== undefined && prev !== p.position) moved = true;
        prevPositions.set(p.id, p.position);
      });
      if (moved) setTokenMoving(true);
      setState(s);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("state", handleState);

    if (socket.connected) attemptRejoin();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("state", handleState);
    };
  }, []);

  function handleJoined(res) {
    saveSession(res);
    setMyId(res.playerId);
    setJoined(true);
  }

  function handleLeave() {
    socket.emit("leaveRoom");
    clearSession();
    setJoined(false);
    setState(null);
    setMyId(null);
  }

  if (rejoining) {
    return (
      <div className="lobby">
        <div className="lobby-content">
          <div className="lobby-title-float">
            <h1 className="lobby-game-title">Monoboly عرب</h1>
          </div>
          <div className="lobby-form-card visible">
            <p style={{ margin: 0, textAlign: "center", color: "var(--text-dim)", fontStyle: "italic", fontSize: 13 }}>Reconnecting…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!joined || !state) {
    return <Lobby onJoined={handleJoined} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!state.started) {
    const isHost = state.hostId === myId;
    const me = state.players.find((p) => p.id === myId);
    const rules = state.rules || {};
    return (
      <div className="lobby">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <div className="lobby-credits">
          <span className="lobby-credits-label">Made by</span>
          <span className="lobby-credits-name">Khalid Khudari</span>
          <span className="lobby-credits-name">Mohamad Muhaisen</span>
          <span className="lobby-credits-name">Ameen Alrawabdeh</span>
        </div>

        <div className="lobby-content">
          <div className="lobby-title-float">
            <div className="lobby-ornament">
              <span className="lobby-ornament-line" />
              <span className="lobby-ornament-diamond">◆</span>
              <span className="lobby-ornament-line" />
            </div>
            <h1 className="lobby-game-title">Monoboly عرب</h1>
            <p className="lobby-subtitle">A property-trading board game for friends, online.</p>
            <div className="lobby-ornament">
              <span className="lobby-ornament-line" />
              <span className="lobby-ornament-diamond">◆</span>
              <span className="lobby-ornament-line" />
            </div>
          </div>

          <div className="lobby-form-card waitroom-card visible">
            {/* Room code hero */}
            <div className="waitroom-code-block">
              <div className="waitroom-code-label">Room Code</div>
              <div className="waitroom-code-row">
                <div className="waitroom-code">{state.code}</div>
                <button
                  className="waitroom-copy-btn"
                  onClick={copyRoomCode}
                  title="Copy room code"
                  aria-label="Copy room code"
                >
                  {codeCopied ? <IconCheck /> : <IconCopy />}
                </button>
              </div>
              <div className="waitroom-code-hint">Share this with friends</div>
            </div>

            <div className="lobby-divider"><span>Players {state.players.length} / 6</span></div>

            {/* Player slots */}
            <div className="waitroom-players">
              {state.players.map((p) => (
                <div key={p.id} className="waitroom-player-row">
                  <span className="waitroom-player-dot" style={{ background: p.color }} />
                  <span className="waitroom-player-name">
                    {p.name}{p.id === myId ? " (you)" : ""}
                  </span>
                  {state.hostId === p.id && <span className="waitroom-host-badge">HOST</span>}
                  {!p.icon && <span className="error">No icon yet</span>}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 2 - state.players.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="waitroom-player-row waitroom-player-empty">
                  <span className="waitroom-player-dot" style={{ background: "rgba(255,255,255,0.08)", border: "1px dashed rgba(201,150,10,0.25)" }} />
                  <span className="waitroom-player-name" style={{ opacity: 0.3, fontStyle: "italic" }}>Waiting…</span>
                </div>
              ))}
            </div>

            {/* Your token icon */}
            <div className="lobby-input-group">
              <label className="lobby-input-label">Your Icon</label>
              <IconPicker players={state.players} myId={myId} />
              {!me?.icon && <div className="error">Please select a player icon</div>}
            </div>

            {/* Game rules panel */}
            <RulesPanel rules={rules} isHost={isHost} />

            {/* Status / action */}
            {isHost ? (
              <>
                {state.players.length < 2 && (
                  <div className="waitroom-waiting-pulse">
                    <span className="waitroom-pulse-dot" />
                    Waiting for another player to join…
                  </div>
                )}
                {startError && <div className="error">{startError}</div>}
                <button
                  className="lobby-btn-primary"
                  disabled={state.players.length < 2}
                  onClick={() => {
                    setStartError("");
                    socket.emit("startGame", (res) => {
                      if (res?.error) setStartError(res.error);
                    });
                  }}
                >
                  Start Game
                </button>
              </>
            ) : (
              <div className="waitroom-waiting-pulse">
                <span className="waitroom-pulse-dot" />
                Waiting for the host to start…
              </div>
            )}

            <button className="lobby-btn-secondary" onClick={handleLeave}>
              Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-screen">
      <div className="game-screen-left">
        <MyProperties state={state} myId={myId} />
      </div>

      <BoardClassic
        state={state}
        myId={myId}
        tokenMoving={tokenMoving}
        onTokenMovingChange={setTokenMoving}
      />

      <div className="game-screen-right">
        <PlayersPanel
          state={state}
          myId={myId}
          onOpenTrade={() => setTradeOpen(true)}
          onLeave={handleLeave}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <OpenTrades state={state} myId={myId} onOpen={() => setTradeOpen(true)} />
        <GameLog state={state} />
      </div>

      {tradeOpen && state.started && (
        <TradeModal state={state} myId={myId} onClose={() => setTradeOpen(false)} />
      )}
      <AuctionModal state={state} myId={myId} />
      {import.meta.env.DEV && <DevTools />}
    </div>
  );
}

export default App;
