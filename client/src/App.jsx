import { useEffect, useState } from "react";
import { socket } from "./socket";
import Lobby from "./components/Lobby";
import Board from "./components/Board";
import Hud from "./components/Hud";
import "./App.css";

function App() {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState(null);
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    function handleState(s) {
      setState(s);
    }
    function handleDisconnect() {
      // A dropped connection forfeits the seat server-side -- there is nothing to
      // reconnect to, so just send the player back to the lobby.
      setJoined(false);
      setState(null);
      setMyId(null);
    }
    socket.on("state", handleState);
    socket.on("disconnect", handleDisconnect);
    return () => {
      socket.off("state", handleState);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  function handleJoined(playerId) {
    setMyId(playerId);
    setJoined(true);
  }

  function handleLeave() {
    socket.emit("leaveRoom");
    setJoined(false);
    setState(null);
    setMyId(null);
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
