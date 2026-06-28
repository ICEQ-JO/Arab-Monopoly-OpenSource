import { useEffect, useState } from "react";
import { socket } from "./socket";
import Lobby from "./components/Lobby";
import Board from "./components/Board";
import Hud from "./components/Hud";
import "./App.css";

function App() {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState(null);
  const [myId, setMyId] = useState(socket.id);

  useEffect(() => {
    function handleConnect() {
      setMyId(socket.id);
    }
    function handleState(s) {
      setState(s);
    }
    socket.on("connect", handleConnect);
    socket.on("state", handleState);
    return () => {
      socket.off("connect", handleConnect);
      socket.off("state", handleState);
    };
  }, []);

  if (!joined || !state) {
    return <Lobby onJoined={() => setJoined(true)} />;
  }

  return (
    <div className="game-screen">
      <Board board={state.board} ownership={state.ownership} players={state.players} pendingAction={state.pendingAction} />
      <Hud state={state} myId={myId} />
    </div>
  );
}

export default App;
