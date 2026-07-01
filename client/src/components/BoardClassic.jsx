import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { playMoveSwoosh } from "../sfx";
import Dice from "./Dice";
import PlayerToken from "./PlayerToken";
import PropertyCardDetail from "./PropertyCardDetail";
import { ICONS } from "../data/icons";
import "../classicVintage.css";

// The "Title Deed" detail card (PropertyCardDetail) assumes a property's
// data shape -- rent tiered by house count, a housePrice -- which transit
// tiles don't share (their rent scales with how many stations are owned,
// they have no housePrice at all, and this board has no utility tiles).
// Scoped to just properties so the card is never opened with data it can't
// represent correctly.
const CLICKABLE_TYPE = "property";

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

function ClassicTile({ tile, owned, players, pendingTileId, sideLen, onSelect, isSelected }) {
  const { id, name, price, amount, groupColor, type } = tile;
  const { edge, row, col } = getLayout(id, sideLen);
  const hasIcon = type === "treasure" || type === "surprise" || type === "tax" || type === "transit" || type === "rest";
  const isLRSide = edge === "left" || edge === "right";
  const nameParts = name.split(" ");
  const isCorner = edge === "corner";
  const ownerColor = owned?.ownerId
    ? players.find((p) => p.id === owned.ownerId)?.color
    : null;
  const isPending = pendingTileId === id;
  const isClickable = type === CLICKABLE_TYPE;

  const badgeValue = price != null ? price : amount;
  const devLabel = owned?.mortgaged
    ? "M"
    : owned?.houses
      ? (owned.houses >= 5 ? "H" : String(owned.houses))
      : null;

  return (
    <div
      className={`cv2-tile ${isCorner ? "cv2-corner" : `cv2-side-${edge}`}${type === "transit" ? " cv2-transit" : ""}${type === "rest" ? " cv2-rest" : ""}${isPending ? " cv2-pending" : ""}${isClickable ? " cv2-tile-clickable" : ""}${isSelected ? " cv2-tile-selected" : ""}`}
      style={{ gridRow: row, gridColumn: col }}
      onClick={isClickable ? (e) => onSelect(id, e.currentTarget, edge) : undefined}
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
    </div>
  );
}

// Renders every occupied tile's token stack in a single board-wide overlay
// grid, sharing the exact same row/col template as the tile grid below it so
// each stack still lines up with its tile -- but as a sibling of the tiles,
// not nested inside one, so a token is never clipped by a tile's own
// `overflow: hidden` while it's elevated or stacked with other occupants.
function TokenLayer({ board, players, sideLen, gridTemplate, currentPlayerId, movingIds, celebratingIds }) {
  return (
    <div
      className="cv2-token-layer"
      style={{ gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate }}
    >
      {board.map((tile) => {
        const occupants = players.filter((p) => p.position === tile.id && !p.bankrupt && !p.left);
        if (occupants.length === 0) return null;
        const { row, col } = getLayout(tile.id, sideLen);
        return (
          <div key={tile.id} className="cv2-token-cell" style={{ gridRow: row, gridColumn: col }}>
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
        );
      })}
    </div>
  );
}

export default function BoardClassic({ state, myId }) {
  const { board, ownership, players, lastRoll, turnIndex, rollSeq } = state;

  // Which tile's info card (build/sell/mortgage) is currently open, if any,
  // its on-screen position (px, relative to the board container), and any
  // error from the last build/sell/mortgage attempt on it.
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const [cardError, setCardError] = useState("");
  const boardRef = useRef(null);
  const cardRef = useRef(null);
  const selectedTileElRef = useRef(null);
  const CARD_GAP = 10;

  // Records which tile is open and a live reference to its DOM node (not a
  // one-time snapshot of its position -- re-measured fresh on every layout
  // pass below, so the card's offset stays correct even if the board
  // resizes while it's open). Clicking the tile that's already open closes it.
  function selectTile(tileId, tileEl, edge) {
    setCardError("");
    const wasOpen = selectedTileId === tileId;
    setSelectedTileId(wasOpen ? null : tileId);
    setSelectedEdge(wasOpen ? null : edge);
    selectedTileElRef.current = wasOpen ? null : tileEl;
  }

  // Positions the card OFFSET from the tile that opened it -- never on top
  // of it -- by pushing outward from whichever edge of the board the tile
  // sits on (top edge -> card opens below it, bottom edge -> above it, left
  // edge -> to its right, right edge -> to its left), then clamps the result
  // so the card still lands fully inside the board's own borders regardless
  // of its (content-dependent) rendered size. Runs after every render --
  // re-measuring the tile/card/board live each time, rather than trusting a
  // stale click-time snapshot -- but bails out via the "same object back"
  // idiom the instant nothing needs to move, so it settles in one extra
  // pass instead of looping.
  useLayoutEffect(() => {
    if (selectedTileId == null) return;
    const boardEl = boardRef.current;
    const cardEl = cardRef.current;
    const tileEl = selectedTileElRef.current;
    if (!boardEl || !cardEl || !tileEl) return;
    const boardRect = boardEl.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const tileRect = tileEl.getBoundingClientRect();
    const tileTop = tileRect.top - boardRect.top;
    const tileLeft = tileRect.left - boardRect.left;

    let top = tileTop;
    let left = tileLeft;
    if (selectedEdge === "top") top = tileTop + tileRect.height + CARD_GAP;
    else if (selectedEdge === "bottom") top = tileTop - CARD_GAP - cardRect.height;
    else if (selectedEdge === "left") left = tileLeft + tileRect.width + CARD_GAP;
    else if (selectedEdge === "right") left = tileLeft - CARD_GAP - cardRect.width;

    const margin = 6;
    const maxLeft = Math.max(margin, boardRect.width - cardRect.width - margin);
    const maxTop = Math.max(margin, boardRect.height - cardRect.height - margin);
    const clampedLeft = Math.min(Math.max(left, margin), maxLeft);
    const clampedTop = Math.min(Math.max(top, margin), maxTop);

    setCardPos((pos) =>
      pos.left === clampedLeft && pos.top === clampedTop ? pos : { left: clampedLeft, top: clampedTop }
    );
  });

  // Re-run the layout pass above on viewport resize too (the board is
  // responsive), not just when the card first opens.
  useEffect(() => {
    if (selectedTileId == null) return;
    const onResize = () => setCardPos((pos) => ({ ...pos }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [selectedTileId]);

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
      playMoveSwoosh();
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

  // Tracks whether the dice's own jump/spin animation (1s, see dice.css
  // `d3-jump`) is still playing for the roll that just happened, so the
  // center action button doesn't swap to "End Turn" out from under the dice
  // mid-tumble -- it waits for the animation to actually finish first.
  const [diceAnimating, setDiceAnimating] = useState(false);
  const lastRollSeqRef = useRef(rollSeq);
  useEffect(() => {
    if (rollSeq === lastRollSeqRef.current) return;
    lastRollSeqRef.current = rollSeq;
    setDiceAnimating(true);
    const t = setTimeout(() => setDiceAnimating(false), 1000);
    return () => clearTimeout(t);
  }, [rollSeq]);

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

  const selectedTile = selectedTileId != null ? board[selectedTileId] : null;
  const selectedOwned = selectedTileId != null ? ownership[selectedTileId] : null;
  const selectedOwnerPlayer = selectedOwned ? players.find((p) => p.id === selectedOwned.ownerId) : null;
  const selectedHouses = selectedOwned?.houses || 0;
  const selectedMortgaged = !!selectedOwned?.mortgaged;
  const isMine = selectedOwned?.ownerId === myId;

  function emitPropertyAction(event) {
    setCardError("");
    socket.emit(event, { tileId: selectedTileId }, (res) => {
      if (res?.error) setCardError(res.error);
    });
  }

  return (
    <div className="cv2-root" style={{ width: "min(980px, 96vw, calc(100vh - 40px))", aspectRatio: "1", margin: "0 auto" }}>
      <div
        ref={boardRef}
        className="cv2-board"
        style={{
          display: "grid",
          gridTemplateColumns: gridTemplate,
          gridTemplateRows: gridTemplate,
          width: "100%",
          height: "100%",
        }}
        onClick={(e) => {
          // A tile's own onClick (below) already manages open/close/switch --
          // this only handles the "clicked somewhere else entirely" case
          // (empty board space, non-property tiles, the center panel).
          if (selectedTileId == null) return;
          if (e.target.closest(".cv2-tile-clickable")) return;
          if (e.target.closest(".cv2-tile-card-wrap")) return;
          setSelectedTileId(null);
          setSelectedEdge(null);
          selectedTileElRef.current = null;
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
            onSelect={selectTile}
            isSelected={selectedTileId === tile.id}
          />
        ))}

        <TokenLayer
          board={board}
          players={players}
          sideLen={sideLen}
          gridTemplate={gridTemplate}
          currentPlayerId={currentPlayerId}
          movingIds={movingIds}
          celebratingIds={celebratingIds}
        />

        {selectedTile && (
          <div
            ref={cardRef}
            className="cv2-tile-card-wrap"
            style={{ position: "absolute", top: cardPos.top, left: cardPos.left, zIndex: 200 }}
          >
            <PropertyCardDetail
              tile={selectedTile}
              houses={selectedHouses}
              mortgaged={selectedMortgaged}
              owner={
                selectedOwnerPlayer && {
                  name: selectedOwnerPlayer.name,
                  color: selectedOwnerPlayer.color,
                  iconImg: selectedOwnerPlayer.icon
                    ? ICONS.find((i) => i.id === selectedOwnerPlayer.icon)?.img
                    : null,
                }
              }
              onBuildHouse={() => emitPropertyAction("buyHouse")}
              onSellHouse={() => emitPropertyAction("sellHouse")}
              onMortgage={() => emitPropertyAction(selectedMortgaged ? "unmortgageProperty" : "mortgageProperty")}
              canBuildHouse={isMine && !selectedMortgaged && selectedHouses < 5}
              canSellHouse={isMine && selectedHouses > 0}
              canMortgage={isMine && (selectedMortgaged || selectedHouses === 0)}
              error={cardError}
            />
          </div>
        )}

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
              // Once the roll is used up (no bonus roll earned) and nothing
              // else is blocking the turn, swap this same button to "End
              // Turn" -- but only once the dice animation has actually
              // finished, so the button doesn't change out from under it
              // mid-tumble.
              if (isMyTurn && !pending && !state.canRollAgain && !diceAnimating) {
                return (
                  <button className="cv2-roll-btn" onClick={() => socket.emit("endTurn")}>
                    End Turn
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

          {/* Dev-only: teleports everyone onto "صنوق الحج" to check the
              same-tile token stacking without playing a real game. */}
          <button
            className="cv2-roll-btn cv2-debug-stack-btn"
            onClick={() => socket.emit("debugStackOnTile", { tileName: "الحج" })}
          >
            Test: stack on صندوق الحج
          </button>

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
