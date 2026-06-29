import { useState } from "react";
import { socket } from "../socket";

export default function Lobby({ onJoined }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function createRoom() {
    if (!name.trim()) return setError("Enter a name first");
    setBusy(true);
    socket.emit("createRoom", { name: name.trim() }, (res) => {
      setBusy(false);
      if (res?.error) return setError(res.error);
      onJoined(res);
    });
  }

  function joinRoom() {
    if (!name.trim()) return setError("Enter a name first");
    if (!code.trim()) return setError("Enter a room code");
    setBusy(true);
    socket.emit("joinRoom", { code: code.trim(), name: name.trim() }, (res) => {
      setBusy(false);
      if (res?.error) return setError(res.error);
      onJoined(res);
    });
  }

  return (
    <div className="lobby">
      <h1>Monoboly عرب</h1>
      <p className="tagline">A property-trading board game for friends, online.</p>

      <div className="lobby-card">
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" maxLength={16} />
        </label>

        <button className="primary" disabled={busy} onClick={createRoom}>
          Create new room
        </button>

        <div className="divider">or</div>

        <label>
          Room code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB12CD"
            maxLength={8}
          />
        </label>
        <button disabled={busy} onClick={joinRoom}>
          Join room
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
