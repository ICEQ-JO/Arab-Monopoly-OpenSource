import "../classicVintage.css";

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

function ClassicTile({ tile, owned, players, pendingTileId, sideLen }) {
  const { id, name, price, amount, groupColor } = tile;
  const { edge, row, col } = getLayout(id, sideLen);
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
      className={`cv2-tile ${isCorner ? "cv2-corner" : `cv2-side-${edge}`}${isPending ? " cv2-pending" : ""}`}
      style={{ gridRow: row, gridColumn: col }}
    >
      {!isCorner && groupColor && <div className="cv2-band" style={{ background: groupColor }} />}
      {!isCorner && ownerColor && <div className="cv2-owner-bar" style={{ background: ownerColor }} />}

      <div className="cv2-body">
        <span className="cv2-name">{name}</span>
        {badgeValue != null && <span className="cv2-price">${badgeValue}</span>}
      </div>

      {devLabel && <div className="cv2-dev">{devLabel}</div>}

      {occupants.length > 0 && (
        <div className="cv2-tokens">
          {occupants.map((p) => (
            <span
              key={p.id}
              className="cv2-token"
              style={{ background: p.color }}
              title={p.name}
            >
              {p.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardClassic({ state, myId }) {
  const { board, ownership, players, lastRoll, turnIndex } = state;

  const sideLen = board.length / 4;
  const N = sideLen + 1;

  const currentPlayerId = players[turnIndex]?.id;
  const pendingAction = state.pendingAction;
  const pendingTileId = pendingAction?.type === "awaitBuy"
    ? players.find((p) => p.id === currentPlayerId)?.position
    : undefined;

  return (
    <div className="cv2-root" style={{ width: "min(900px, 92vw)", aspectRatio: "1", margin: "0 auto" }}>
      <div
        className="cv2-board"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${N}, 1fr)`,
          gridTemplateRows: `repeat(${N}, 1fr)`,
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
          />
        ))}

        <div className="cv2-center">
          <div className="cv2-title">Monoboly عرب</div>

          {lastRoll && (
            <div className="cv2-dice">{lastRoll[0]} + {lastRoll[1]}</div>
          )}

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
