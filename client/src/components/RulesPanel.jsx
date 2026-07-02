import { useState } from "react";
import { socket } from "../socket";

const RULE_DEFS = [
  { key: "vacationPot",      label: "Vacation Cash Pot",        desc: "Taxes & fines go into a pot — landing on Vacation collects it all" },
  { key: "noRentInPrison",   label: "No Rent While in Prison",  desc: "Owners in the Holding Pen cannot collect rent" },
  { key: "evenBuild",        label: "Even Build",               desc: "Houses must be built and sold evenly within a color group" },
  { key: "doubleRentFullSet",label: "x2 Rent (Full Set)",       desc: "Owning all tiles in a color group doubles base rent" },
  { key: "auction",          label: "Auction on Decline",       desc: "Skipping a property sends it to auction for all players" },
];

// Visible to everyone in the room, editable only by the host -- lives inside
// the room (waitroom / character select) rather than in the pre-room create
// flow, so every player (not just whoever clicked Create) can see what's set.
export default function RulesPanel({ rules, isHost }) {
  const [open, setOpen] = useState(false);

  function updateRule(key, value) {
    socket.emit("updateRoomSettings", { rules: { ...rules, [key]: value } });
  }

  return (
    <div className="rules-panel">
      <div className="rules-panel-header" onClick={() => setOpen((o) => !o)}>
        <span>⚙ Game Rules</span>
        <span className={`rules-panel-toggle-icon${open ? " open" : ""}`}>▼</span>
      </div>
      {open && (
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

          {import.meta.env.DEV && <DevPanel />}
        </div>
      )}
    </div>
  );
}

// Dev-build only (stripped from production via import.meta.env.DEV) -- lets
// whoever clicks it instantly own a full color group, for testing
// building-UI/mortgage-rendering changes without playing through a real
// game to acquire a set. Grants to the clicking player, not host-gated.
function DevPanel() {
  function grant(group) {
    socket.emit("debugGrantGroup", { group });
  }

  return (
    <div className="rule-row rule-row-dev">
      <div className="rule-label">
        <span className="rule-name">🛠 DEV: Grant Group</span>
        <span className="rule-desc">Instantly own a full color group, for testing</span>
      </div>
      <button className="rule-dev-btn" onClick={() => grant("blueTop")}>
        Kuwait Area
      </button>
    </div>
  );
}
