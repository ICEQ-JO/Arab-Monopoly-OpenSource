import { useEffect, useState } from "react";
import { socket } from "./socket";
import { loadSession, clearSession } from "./session";
import Lobby from "./components/Lobby";
import Board from "./components/Board";
import Hud from "./components/Hud";
import "./App.css";

function App() {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [rejoining, setRejoining] = useState(false);
  const [connected, setConnected] = useState(socket.connected);

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
      setConnected(true);
      attemptRejoin();
    }
    function handleDisconnect() {
      setConnected(false);
    }
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

  function handleLeave() {
    clearSession();
    setJoined(false);
    setState(null);
    setMyId(null);
  }

  if (rejoining) {
    return (
      <div className="lobby">
        <p>Reconnecting...</p>
      </div>
    );
  }

  if (!joined || !state) {
    return (
      <Lobby
        onJoined={(id) => {
          setMyId(id);
          setJoined(true);
        }}
      />
    );
  }

  return (
    <div className="game-screen">
      {!connected && <div className="reconnect-banner">Connection lost — trying to reconnect...</div>}
      <Board board={state.board} ownership={state.ownership} players={state.players} pendingAction={state.pendingAction} />
      <Hud state={state} myId={myId} onLeave={handleLeave} />
    </div>
  );
}

export default App;
