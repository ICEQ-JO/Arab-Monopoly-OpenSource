import { useEffect, useState } from "react";
import { socket } from "./socket";
import { loadSession, saveSession, clearSession } from "./session";
import Lobby from "./components/Lobby";
import Board from "./components/Board";
import Hud from "./components/Hud";
import "./App.css";

function App() {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [rejoining, setRejoining] = useState(false);

  useEffect(() => {
    function attemptRejoin() {
      const session = loadSession();
      if (!session) return;
      setRejoining(true);
      socket.emit("rejoinRoom", session, (res) => {
        setRejoining(false);
        if (res?.error) {
          // Most likely the 20s grace window already expired and the seat is gone.
          clearSession();
          return;
        }
        setMyId(res.playerId);
        setJoined(true);
      });
    }

    function handleConnect() {
      // Fires on first connect and on any underlying socket.io reconnect --
      // either way, if we have a saved session, try to reclaim the seat
      // before the server's 20s grace window runs out.
      attemptRejoin();
    }
    function handleDisconnect() {
      // Don't reset to the lobby immediately: socket.io will try to
      // reconnect on its own, and handleConnect will attempt rejoinRoom
      // if it succeeds within the grace window.
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
        <p>Reconnecting...</p>
      </div>
    );
  }

  if (!joined || !state) {
    return <Lobby onJoined={handleJoined} />;
  }

  return (
    <div className="game-screen">
      <Board board={state.board} ownership={state.ownership} players={state.players} pendingAction={state.pendingAction} />
      <Hud state={state} myId={myId} onLeave={handleLeave} />
    </div>
  );
}

export default App;
