import { useEffect, useState } from "react";
import { socket } from "./socket";
import { loadSession, saveSession, clearSession } from "./session";
import { getStoredTheme, applyTheme } from "./theme";
import Lobby from "./components/Lobby";
import BoardClassic from "./components/BoardClassic";
import Hud from "./components/Hud";
import PlayersPanel from "./components/PlayersPanel";
import TradeModal from "./components/TradeModal";
import RulesPanel from "./components/RulesPanel";
import ColorPicker from "./components/ColorPicker";
import ThemeToggle from "./components/ThemeToggle";
import "./App.css";

function App() {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [rejoining, setRejoining] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
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
              <div className="waitroom-code">{state.code}</div>
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
                </div>
              ))}
              {Array.from({ length: Math.max(0, 2 - state.players.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="waitroom-player-row waitroom-player-empty">
                  <span className="waitroom-player-dot" style={{ background: "rgba(255,255,255,0.08)", border: "1px dashed rgba(201,150,10,0.25)" }} />
                  <span className="waitroom-player-name" style={{ opacity: 0.3, fontStyle: "italic" }}>Waiting…</span>
                </div>
              ))}
            </div>

            {/* Your color */}
            <div className="lobby-input-group">
              <label className="lobby-input-label">Your Color</label>
              <ColorPicker players={state.players} myId={myId} />
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
                <button
                  className="lobby-btn-primary"
                  disabled={state.players.length < 2}
                  onClick={() => socket.emit("startGame")}
                >
                  <span className="lobby-btn-icon">⚔</span> Start Game
                </button>
              </>
            ) : (
              <div className="waitroom-waiting-pulse">
                <span className="waitroom-pulse-dot" />
                Waiting for the host to start…
              </div>
            )}

            <button className="lobby-btn-secondary" onClick={handleLeave}>
              <span className="lobby-btn-icon">🚪</span> Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-screen">
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <PlayersPanel state={state} myId={myId} onOpenTrade={() => setTradeOpen(true)} onLeave={handleLeave} />

      <BoardClassic state={state} myId={myId} />

      <Hud state={state} myId={myId} />

      {tradeOpen && state.started && (
        <TradeModal state={state} myId={myId} onClose={() => setTradeOpen(false)} />
      )}
    </div>
  );
}

export default App;
