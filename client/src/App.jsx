import { useEffect, useState } from "react";
import { socket } from "./socket";
import { loadSession, saveSession, clearSession } from "./session";
import Lobby from "./components/Lobby";
import CharacterSelect from "./components/CharacterSelect";
import Board from "./components/Board";
import Hud from "./components/Hud";
import PlayerCard from "./components/PlayerCard";
import PlayersPanel from "./components/PlayersPanel";
import TradeModal from "./components/TradeModal";
import LobbyBackground from "./components/LobbyBackground";
import "./App.css";

const RULE_DEFS = [
  { key: "vacationPot",      label: "Vacation Cash Pot",       desc: "Taxes & fines go into a pot — landing on Vacation collects it all" },
  { key: "noRentInPrison",   label: "No Rent While in Prison",  desc: "Owners in the Holding Pen cannot collect rent" },
  { key: "evenBuild",        label: "Even Build",               desc: "Houses must be built and sold evenly within a color group" },
  { key: "doubleRentFullSet",label: "x2 Rent (Full Set)",       desc: "Owning all tiles in a color group doubles base rent" },
  { key: "auction",          label: "Auction on Decline",       desc: "Skipping a property sends it to auction for all players" },
];

function App() {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [rejoining, setRejoining] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

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

  function updateRule(key, value) {
    const rules = { ...state.rules, [key]: value };
    socket.emit("updateRoomSettings", { rules });
  }

  if (rejoining) {
    return (
      <div className="lobby">
        <LobbyBackground />
        <div className="lobby-content">
          <div className="lobby-title-float">
            <h1 className="lobby-game-title">Monoboly عرب</h1>
          </div>
          <div className="lobby-form-card visible">
            <p style={{ margin: 0, textAlign: "center", color: "rgba(201,150,10,0.7)", fontStyle: "italic", fontSize: 13 }}>Reconnecting…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!joined || !state) {
    return <Lobby onJoined={handleJoined} />;
  }

  if (!state.started) {
    if (state.gameMode === "characters") {
      return <CharacterSelect state={state} myId={myId} onLeave={handleLeave} />;
    }
    const isHost = state.hostId === myId;
    const rules = state.rules || {};
    return (
      <div className="lobby">
        <LobbyBackground />

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

            {/* Game rules panel */}
            <div className="rules-panel">
              <div className="rules-panel-header" onClick={() => setRulesOpen((o) => !o)}>
                <span>⚙ Game Rules</span>
                <span className={`rules-panel-toggle-icon${rulesOpen ? " open" : ""}`}>▼</span>
              </div>
              {rulesOpen && (
                <div className="rules-panel-body">
                  {RULE_DEFS.map(({ key, label, desc }) => (
                    <div key={key} className={`rule-row${!isHost ? " rule-row-readonly" : ""}`}>
                      <div className="rule-label">
                        <span className="rule-name">{label}</span>
                        <span className="rule-desc">{desc}</span>
                      </div>
                      <label className="rule-switch">
                        <input
                          type="checkbox"
                          checked={!!rules[key]}
                          disabled={!isHost}
                          onChange={(e) => updateRule(key, e.target.checked)}
                        />
                        <span className="rule-switch-track" />
                      </label>
                    </div>
                  ))}
                  <div className={`rule-row${!isHost ? " rule-row-readonly" : ""}`}>
                    <div className="rule-label">
                      <span className="rule-name">Starting Cash</span>
                      <span className="rule-desc">How much money each player starts with</span>
                    </div>
                    <input
                      type="number"
                      className="rule-cash-input"
                      value={rules.startingCash ?? 1500}
                      disabled={!isHost}
                      min={500}
                      max={5000}
                      step={500}
                      onChange={(e) => updateRule("startingCash", Number(e.target.value))}
                    />
                  </div>
                </div>
              )}
            </div>

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

  const me = state.players.find((p) => p.id === myId);
  const hasCard = !!(me?.characterId);

  return (
    <div className="game-screen">
      {hasCard
        ? <PlayerCard player={me} />
        : <PlayersPanel state={state} myId={myId} onOpenTrade={() => setTradeOpen(true)} />
      }

      <Board state={state} myId={myId} />

      <Hud state={state} myId={myId} />

      {tradeOpen && state.started && (
        <TradeModal state={state} myId={myId} onClose={() => setTradeOpen(false)} />
      )}
    </div>
  );
}

export default App;
