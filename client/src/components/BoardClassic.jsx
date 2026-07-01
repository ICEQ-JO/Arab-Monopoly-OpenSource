import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import Dice from "./Dice";
import PlayerToken from "./PlayerToken";
import "../classicVintage.css";

function TreasureIcon() {
  return (
    <svg className="cv2-tile-icon" viewBox="0 0 100 84" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="44" width="84" height="34" rx="9" fill="#f59e0b"/>
      <rect x="8" y="44" width="84" height="16" rx="9" fill="#b45309" opacity="0.3"/>
      <path d="M8 46 C8 18 22 6 50 6 C78 6 92 18 92 46 Z" fill="#f59e0b"/>
      <path d="M15 46 C15 24 26 16 50 16 C74 16 85 24 85 46 Z" fill="#78350f" opacity="0.28"/>
      <rect x="8" y="40" width="84" height="14" rx="4" fill="#b45309"/>
      <rect x="34" y="32" width="32" height="30" rx="8" fill="#fbbf24" stroke="#d97706" strokeWidth="2"/>
      <circle cx="50" cy="44" r="7" fill="#3d1a00"/>
      <rect x="46.5" y="48" width="7" height="9" rx="2" fill="#3d1a00"/>
      <path d="M16 16 Q36 8 54 13" stroke="rgba(255,255,255,0.55)" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <path d="M18 24 Q32 18 44 21" stroke="rgba(255,255,255,0.28)" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function TaxIcon() {
  return <img src="/pig.svg" className="cv2-tile-icon" alt="" />;
}

function SurpriseIcon() {
  return (
    <svg className="cv2-tile-icon" viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="qmarkGrad" x1="0.2" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ff9ee0"/>
          <stop offset="45%" stopColor="#f046a8"/>
          <stop offset="100%" stopColor="#b5126e"/>
        </linearGradient>
      </defs>
      <text
        x="50%" y="62%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize="82"
        fontWeight="900"
        fill="url(#qmarkGrad)"
        fontFamily="Georgia, serif"
      >?</text>
    </svg>
  );
}

// Generic square-loop layout: corners sit every `sideLen` ids (0, sideLen,
// 2*sideLen, 3*sideLen), ids increase clockwise from the top-left corner.
// For the 48-tile classic-vintage board, sideLen = 12, grid = 13x13.
function getLayout(id, sideLen) {
  const N = sideLen + 1;
  const local = id % sideLen;
  const seg = Math.floor(id / sideLen);
  const corner = local === 0;
  const edge = corner ? "corner" : ["top", "right", "bottom", "left"][seg];
  let row, col;
  switch (seg) {
    case 0: row = 1;          col = local + 1; break; // top: left -> right
    case 1: row = local + 1;  col = N;          break; // right: top -> bottom
    case 2: row = N;          col = N - local;  break; // bottom: right -> left
    default: row = N - local; col = 1;          break; // left: bottom -> top
  }
  return { edge, row, col, N };
}

function ClassicTile({ tile, owned, players, pendingTileId, sideLen, currentPlayerId, movingIds, celebratingIds }) {
  const { id, name, price, amount, groupColor, type } = tile;
  const { edge, row, col } = getLayout(id, sideLen);
  const hasIcon = type === "treasure" || type === "surprise" || type === "tax" || type === "transit" || type === "rest";
  const isLRSide = edge === "left" || edge === "right";
  const nameParts = name.split(" ");
  const isCorner = edge === "corner";
  const ownerColor = owned?.ownerId
    ? players.find((p) => p.id === owned.ownerId)?.color
    : null;
  const occupants = players.filter((p) => p.position === id && !p.bankrupt && !p.left);
  const isPending = pendingTileId === id;

  const badgeValue = price != null ? price : amount;
  const devLabel = owned?.mortgaged
    ? "M"
    : owned?.houses
      ? (owned.houses >= 5 ? "H" : String(owned.houses))
      : null;

  return (
    <div
      className={`cv2-tile ${isCorner ? "cv2-corner" : `cv2-side-${edge}`}${type === "transit" ? " cv2-transit" : ""}${type === "rest" ? " cv2-rest" : ""}${isPending ? " cv2-pending" : ""}`}
      style={{ gridRow: row, gridColumn: col }}
    >
      {!isCorner && groupColor && <div className="cv2-band" style={{ background: groupColor }} />}
      {!isCorner && ownerColor && <div className="cv2-owner-bar" style={{ background: ownerColor }} />}
      {!isCorner && badgeValue != null && (
        <div className="cv2-price-tag">
          <span className="cv2-price">${badgeValue}</span>
        </div>
      )}

      <div className={`cv2-body${hasIcon ? " cv2-body--icon" : ""}`}>
        {type === "transit" ? (
          <div className="cv2-transit-layout">
            <span className="cv2-transit-name">{nameParts[0]}</span>
            <img src="/bus.svg" className="cv2-bus-icon" alt="" />
            <span className="cv2-transit-name">{nameParts.slice(1).join(" ")}</span>
          </div>
        ) : hasIcon ? (
          <div className="cv2-icon-center">
            <span className="cv2-special-name">
              {isLRSide && name.includes(" ")
                ? name.split(" ").map((word, i) => (
                    <span key={i} style={{ display: "block", textAlign: "center" }}>{word}</span>
                  ))
                : name}
            </span>
            {type === "treasure" ? <TreasureIcon /> : type === "surprise" ? <SurpriseIcon /> : type === "tax" ? <TaxIcon /> : <img src="/regeneration.svg" className="cv2-tile-icon" alt="" />}
          </div>
        ) : (
          <span className="cv2-name">{name}</span>
        )}
      </div>

      {devLabel && <div className="cv2-dev">{devLabel}</div>}

      {occupants.length > 0 && (
        <div className="cv2-tokens">
          {occupants.map((p, i) => (
            <PlayerToken
              key={p.id}
              player={p}
              stackIndex={i}
              stackTotal={occupants.length}
              isMoving={movingIds.has(p.id)}
              justBought={celebratingIds.has(p.id)}
              isActiveTurn={p.id === currentPlayerId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardClassic({ state, myId }) {
  const { board, ownership, players, lastRoll, turnIndex } = state;

  const [rollSeq, setRollSeq] = useState(0);
  const prevRollRef = useRef(lastRoll);
  useEffect(() => {
    if (lastRoll !== prevRollRef.current) {
      prevRollRef.current = lastRoll;
      setRollSeq((s) => s + 1);
    }
  }, [lastRoll]);

  // Detect per-player position/property-count changes across state broadcasts
  // (same prev-ref-diff idiom as rollSeq above) to trigger one-shot token
  // hop/celebrate animations instead of a continuous state-driven animation.
  const [movingIds, setMovingIds] = useState(() => new Set());
  const [celebratingIds, setCelebratingIds] = useState(() => new Set());
  const prevPositionsRef = useRef(new Map(players.map((p) => [p.id, p.position])));
  const prevPropCountsRef = useRef(new Map(players.map((p) => [p.id, p.properties.length])));

  useEffect(() => {
    const prevPositions = prevPositionsRef.current;
    const movedIds = [];
    players.forEach((p) => {
      if (prevPositions.get(p.id) !== undefined && prevPositions.get(p.id) !== p.position) movedIds.push(p.id);
      prevPositions.set(p.id, p.position);
    });

    const prevPropCounts = prevPropCountsRef.current;
    const boughtIds = [];
    players.forEach((p) => {
      const prevCount = prevPropCounts.get(p.id);
      if (prevCount !== undefined && p.properties.length > prevCount) boughtIds.push(p.id);
      prevPropCounts.set(p.id, p.properties.length);
    });

    const timers = [];
    if (movedIds.length) {
      setMovingIds((s) => new Set([...s, ...movedIds]));
      timers.push(setTimeout(() => setMovingIds((s) => {
        const next = new Set(s); movedIds.forEach((id) => next.delete(id)); return next;
      }), 550));
    }
    if (boughtIds.length) {
      setCelebratingIds((s) => new Set([...s, ...boughtIds]));
      timers.push(setTimeout(() => setCelebratingIds((s) => {
        const next = new Set(s); boughtIds.forEach((id) => next.delete(id)); return next;
      }), 700));
    }
    return () => timers.forEach(clearTimeout);
  }, [players]);

  const sideLen = board.length / 4;
  const N = sideLen + 1;

  // Rim tracks (row 1 / row N / col 1 / col N) are wider than inner tracks so
  // tiles take up more of the board and the center shrinks. Tiles become
  // rectangular as a result (taller on top/bottom, wider on left/right) --
  // confirmed look via prototype before implementing.
  const RIM_FR = 1.7;
  const INNER_FR = 1;
  const gridTemplate = `${RIM_FR}fr repeat(${N - 2}, ${INNER_FR}fr) ${RIM_FR}fr`;

  const currentPlayerId = players[turnIndex]?.id;
  const pendingAction = state.pendingAction;
  const pendingTileId = pendingAction?.type === "awaitBuy"
    ? players.find((p) => p.id === currentPlayerId)?.position
    : undefined;

  return (
    <div className="cv2-root" style={{ width: "min(980px, 96vw, calc(100vh - 40px))", aspectRatio: "1", margin: "0 auto" }}>
      <div
        className="cv2-board"
        style={{
          display: "grid",
          gridTemplateColumns: gridTemplate,
          gridTemplateRows: gridTemplate,
          width: "100%",
          height: "100%",
        }}
      >
        {board.map((tile) => (
          <ClassicTile
            key={tile.id}
            tile={tile}
            owned={ownership[tile.id]}
            players={players}
            pendingTileId={pendingTileId}
            sideLen={sideLen}
            currentPlayerId={currentPlayerId}
            movingIds={movingIds}
            celebratingIds={celebratingIds}
          />
        ))}

        <div className="cv2-center">
          <div className="cv2-title">Monoboly عرب</div>

          <div className="cv2-dice-area">
            <Dice roll={lastRoll} rollSeq={rollSeq} />
            {(() => {
              const isMyTurn = players[turnIndex]?.id === myId;
              const pending = state.pendingAction;
              if (isMyTurn && !pending && state.canRollAgain) {
                return (
                  <button className="cv2-roll-btn" onClick={() => socket.emit("rollDice")}>
                    Roll Dice
                  </button>
                );
              }
              if (!isMyTurn) {
                const current = players[turnIndex];
                return <p className="cv2-turn-status">Waiting for {current?.name}…</p>;
              }
              return null;
            })()}
          </div>

          <div className="cv2-players">
            {players.filter((p) => !p.left).map((p) => (
              <div key={p.id} className="cv2-player-row">
                <span className="cv2-dot" style={{ background: p.color }} />
                <span>{p.name}</span>
                <span>${p.balance}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
