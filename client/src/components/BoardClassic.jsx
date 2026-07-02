import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { playMoveSwoosh, primeAudio } from "../sfx";
import Dice from "./Dice";
import PlayerToken from "./PlayerToken";
import PropertyCardDetail from "./PropertyCardDetail";
import TransitCardDetail from "./TransitCardDetail";
import { ICONS } from "../data/icons";
import "../classicVintage.css";

// PropertyCardDetail assumes a property's data shape -- rent tiered by
// house count, a housePrice -- which transit tiles don't share (their rent
// scales with how many stations are owned, and they have no housePrice at
// all). Transit tiles get their own TransitCardDetail card instead; this
// board has no utility tiles so those two cover every ownable tile type.
const CLICKABLE_TYPES = ["property", "transit"];

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

// Percentage (of the board's width/height) of the center of each of the N
// grid tracks, given the same rim/inner fr weighting used for the tile grid
// itself (see RIM_FR/INNER_FR below) -- lets a token be positioned with
// plain left/top percentages instead of CSS grid placement, so a CSS
// transition can glide it smoothly between tiles instead of snapping.
// Index 0 = track 1 (first row/col), index N-1 = track N (last row/col).
function buildTrackCenters(N, rimFr, innerFr) {
  const totalFr = rimFr * 2 + innerFr * (N - 2);
  const centers = [];
  let acc = 0;
  for (let t = 1; t <= N; t++) {
    const fr = (t === 1 || t === N) ? rimFr : innerFr;
    centers.push(((acc + fr / 2) / totalFr) * 100);
    acc += fr;
  }
  return centers;
}

// Every move (including a card-driven teleport) walks forward tile by tile,
// wrapping past the last tile back to 0 -- matches how movement already
// works server-side, and is what lets a token visually trace the board
// instead of jumping straight to wherever it landed.
function computeForwardPath(from, to, totalTiles) {
  const path = [];
  let cur = from;
  while (cur !== to) {
    cur = (cur + 1) % totalTiles;
    path.push(cur);
  }
  return path;
}

function ClassicTile({ tile, owned, players, pendingTileId, sideLen, onSelect, isSelected }) {
  const { id, name, price, amount, groupColor, type } = tile;
  const { edge, row, col } = getLayout(id, sideLen);
  const hasIcon = type === "treasure" || type === "surprise" || type === "tax" || type === "transit" || type === "rest";
  const isLRSide = edge === "left" || edge === "right";
  const nameParts = name.split(" ");
  const isCorner = edge === "corner";
  // Mortgaged tiles go dull grey regardless of owner, so the board reads
  // "not earning rent" at a glance instead of still flashing the owner color.
  const ownerColor = owned?.ownerId
    ? (owned.mortgaged ? "#5a5a5a" : players.find((p) => p.id === owned.ownerId)?.color)
    : null;
  const isPending = pendingTileId === id;
  const isClickable = CLICKABLE_TYPES.includes(type);

  const badgeValue = price != null ? price : amount;
  const houses = owned?.houses || 0;
  const isHotel = houses >= 5;

  return (
    <div
      className={`cv2-tile ${isCorner ? "cv2-corner" : `cv2-side-${edge}`}${type === "transit" ? " cv2-transit" : ""}${type === "rest" ? " cv2-rest" : ""}${isPending ? " cv2-pending" : ""}${isClickable ? " cv2-tile-clickable" : ""}${isSelected ? " cv2-tile-selected" : ""}`}
      style={{ gridRow: row, gridColumn: col, ...(!isCorner && ownerColor ? { background: ownerColor } : {}) }}
      onClick={isClickable ? (e) => onSelect(id, e.currentTarget, edge) : undefined}
    >
      {!isCorner && groupColor && <div className="cv2-band" style={{ background: groupColor }} />}
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

      {owned?.mortgaged && <div className="cv2-dev">M</div>}
      {!owned?.mortgaged && houses > 0 && (
        <div className="cv2-building-badge">
          <span
            className="cv2-building-icon"
            style={{ "--icon-url": `url(${isHotel ? "/icons/hotel.svg" : "/icons/house.svg"})` }}
          />
          {!isHotel && <span className="cv2-building-count">x{houses}</span>}
        </div>
      )}
    </div>
  );
}

// Renders every occupied tile's token stack in a single board-wide overlay,
// as a sibling of the tiles rather than nested inside one (so a token is
// never clipped by a tile's own `overflow: hidden` while elevated/stacked).
// Each token is placed with plain left/top percentages (trackCenters) and a
// CSS transition on those, not CSS grid placement -- grid-row/column can't
// be animated, but a percentage can, which is what lets a move glide
// smoothly between tiles instead of snapping.
function TokenLayer({ players, sideLen, trackCenters, currentPlayerId, visualPositions, movingIds, celebratingIds }) {
  // Grouped by `visualPositions` (where a move's glide has currently
  // reached), not the authoritative `player.position` -- the two only match
  // once a glide finishes, so mid-move a token still shows on whichever
  // tile it's passing through, and stacking (stackIndex/stackTotal) follows
  // that same in-transit tile too.
  const byTile = new Map();
  players.forEach((p) => {
    if (p.bankrupt || p.left) return;
    const tileId = visualPositions.get(p.id);
    if (tileId == null) return;
    if (!byTile.has(tileId)) byTile.set(tileId, []);
    byTile.get(tileId).push(p);
  });

  return (
    <div className="cv2-token-layer">
      {[...byTile.entries()].flatMap(([tileId, occupants]) => {
        const { row, col } = getLayout(tileId, sideLen);
        const leftPct = trackCenters[col - 1];
        const topPct = trackCenters[row - 1];
        return occupants.map((p, i) => (
          <PlayerToken
            key={p.id}
            player={p}
            stackIndex={i}
            stackTotal={occupants.length}
            leftPct={leftPct}
            topPct={topPct}
            isMoving={movingIds.has(p.id)}
            justBought={celebratingIds.has(p.id)}
            isActiveTurn={p.id === currentPlayerId}
          />
        ));
      })}
    </div>
  );
}

export default function BoardClassic({ state, myId }) {
  const { board, ownership, players, lastRoll, turnIndex, rollSeq } = state;

  // Which tile's info card is currently open, if any, and its on-screen
  // position (px, relative to the board container). Read-only here -- build/
  // sell/mortgage controls live only in the My Properties panel now, so this
  // card has nothing to submit and thus no error state of its own.
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const boardRef = useRef(null);
  const cardRef = useRef(null);
  const selectedTileElRef = useRef(null);
  const CARD_GAP = 10;

  // Records which tile is open and a live reference to its DOM node (not a
  // one-time snapshot of its position -- re-measured fresh on every layout
  // pass below, so the card's offset stays correct even if the board
  // resizes while it's open).
  function openTile(tileId, tileEl, edge) {
    setSelectedTileId(tileId);
    setSelectedEdge(edge);
    selectedTileElRef.current = tileEl;
  }

  function closeTile() {
    setSelectedTileId(null);
    setSelectedEdge(null);
    selectedTileElRef.current = null;
  }

  // Click-only: opens the card, or closes it if the already-open tile is
  // clicked again. Stays open until an explicit click (this or elsewhere on
  // the board) -- no hover-preview, which was the source of a string of
  // flicker/mis-position bugs.
  function selectTile(tileId, tileEl, edge) {
    if (selectedTileId === tileId) {
      closeTile();
      return;
    }
    openTile(tileId, tileEl, edge);
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
  // (prev-ref-idiom) to drive one-shot animations instead of a continuous
  // state-driven one. Movement in particular traces forward tile-by-tile
  // (visualPositions -- what TokenLayer actually renders, separate from the
  // authoritative `player.position`) rather than teleporting straight to the
  // destination: each step just updates the tile a token is *at*, and
  // TokenLayer positions it there with a plain left/top percentage that has
  // a CSS transition on it (see .cv2-token in classicVintage.css), so the
  // repeated small position changes read as one continuous glide along the
  // board instead of a hop-and-remount per tile. If the move came from a
  // dice roll (rollSeq changed in this same update), it waits for the
  // dice's own 1s tumble animation to finish before the token sets off.
  const GLIDE_STEP_MS = 110; // keep in sync with the transition duration on .cv2-token
  const [visualPositions, setVisualPositions] = useState(
    () => new Map(players.map((p) => [p.id, p.position]))
  );
  const [movingIds, setMovingIds] = useState(() => new Set());
  const [celebratingIds, setCelebratingIds] = useState(() => new Set());
  const prevPositionsRef = useRef(new Map(players.map((p) => [p.id, p.position])));
  const prevRollSeqRef = useRef(rollSeq);
  const prevPropCountsRef = useRef(new Map(players.map((p) => [p.id, p.properties.length])));

  useEffect(() => {
    const prevPositions = prevPositionsRef.current;
    const rollJustHappened = rollSeq !== prevRollSeqRef.current;
    prevRollSeqRef.current = rollSeq;

    const moves = [];
    players.forEach((p) => {
      const prev = prevPositions.get(p.id);
      if (prev !== undefined && prev !== p.position) moves.push({ id: p.id, from: prev, to: p.position });
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

    if (moves.length) {
      const startDelay = rollJustHappened ? 1000 : 0;
      timers.push(setTimeout(() => {
        playMoveSwoosh();
        moves.forEach(({ id, from, to }) => {
          const path = computeForwardPath(from, to, board.length);
          let i = 0;
          const stepNext = () => {
            if (i >= path.length) {
              setMovingIds((s) => new Set(s).add(id));
              timers.push(setTimeout(() => setMovingIds((s) => {
                const next = new Set(s); next.delete(id); return next;
              }), 550));
              return;
            }
            setVisualPositions((m) => new Map(m).set(id, path[i]));
            i += 1;
            timers.push(setTimeout(stepNext, GLIDE_STEP_MS));
          };
          stepNext();
        });
      }, startDelay));
    }

    if (boughtIds.length) {
      setCelebratingIds((s) => new Set([...s, ...boughtIds]));
      timers.push(setTimeout(() => setCelebratingIds((s) => {
        const next = new Set(s); boughtIds.forEach((id) => next.delete(id)); return next;
      }), 700));
    }
    return () => timers.forEach(clearTimeout);
  }, [players, rollSeq, board.length]);

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
  const trackCenters = buildTrackCenters(N, RIM_FR, INNER_FR);

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
  const selectedStationsOwned = selectedOwned
    ? board.filter((t) => t.type === "transit" && ownership[t.id]?.ownerId === selectedOwned.ownerId).length
    : 0;

  return (
    <div className="cv2-root" style={{ width: "100%", height: "100%" }}>
      <div
        ref={boardRef}
        className="cv2-board"
        style={{
          display: "grid",
          gridTemplateColumns: gridTemplate,
          gridTemplateRows: gridTemplate,
          height: "100%",
          width: "auto",
          maxWidth: "100%",
          maxHeight: "1400px",
          aspectRatio: "1",
        }}
        onClick={(e) => {
          // A tile's own onClick (below) already manages open/close/switch --
          // this only handles the "clicked somewhere else entirely" case
          // (empty board space, non-property tiles, the center panel).
          if (selectedTileId == null) return;
          if (e.target.closest(".cv2-tile-clickable")) return;
          if (e.target.closest(".cv2-tile-card-wrap")) return;
          closeTile();
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
          players={players}
          sideLen={sideLen}
          trackCenters={trackCenters}
          currentPlayerId={currentPlayerId}
          visualPositions={visualPositions}
          movingIds={movingIds}
          celebratingIds={celebratingIds}
        />

        {selectedTile && (
          <div
            ref={cardRef}
            className="cv2-tile-card-wrap"
            style={{ position: "absolute", top: cardPos.top, left: cardPos.left, zIndex: 200 }}
          >
            {selectedTile.type === "transit" ? (
              <TransitCardDetail
                tile={selectedTile}
                mortgaged={selectedMortgaged}
                ownedCount={selectedStationsOwned}
                owner={
                  selectedOwnerPlayer && {
                    name: selectedOwnerPlayer.name,
                    color: selectedOwnerPlayer.color,
                    iconImg: selectedOwnerPlayer.icon
                      ? ICONS.find((i) => i.id === selectedOwnerPlayer.icon)?.img
                      : null,
                  }
                }
                showActions={false}
              />
            ) : (
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
                showActions={false}
              />
            )}
          </div>
        )}

        <div className="cv2-center">
          <div className="cv2-title">Monoboly عرب</div>

          <div className="cv2-dice-zone">
            <Dice roll={lastRoll} rollSeq={rollSeq} />
          </div>

          <div className="cv2-action-zone">
            {(() => {
              const isMyTurn = players[turnIndex]?.id === myId;
              const pending = state.pendingAction;
              const me = players.find((p) => p.id === myId);
              // Buy/Decline takes priority over everything else -- it's the
              // action blocking the turn whenever it's pending.
              if (isMyTurn && pending?.type === "awaitBuy") {
                return (
                  <div className="cv2-action-row">
                    <button className="cv2-roll-btn cv2-decline-btn" onClick={() => socket.emit("declineBuy")}>
                      Decline
                    </button>
                    <button className="cv2-roll-btn" onClick={() => socket.emit("buyProperty")}>
                      Buy
                    </button>
                  </div>
                );
              }
              // A drawn card that moves the player somewhere must be
              // acknowledged before anything else can happen this turn.
              if (isMyTurn && pending?.type === "awaitCardMove") {
                return (
                  <button className="cv2-roll-btn" onClick={() => socket.emit("confirmCardMove")}>
                    Continue
                  </button>
                );
              }
              // Stuck in the Holding Pen at the start of the turn (before
              // rolling): pay out or use a free card instead of rolling.
              if (isMyTurn && !pending && me?.inHolding && !state.lastRoll) {
                return (
                  <div className="cv2-action-row">
                    <button className="cv2-roll-btn" onClick={() => socket.emit("payToLeaveHolding")}>
                      Pay $50
                    </button>
                    {me.holdingFreeCard && (
                      <button className="cv2-roll-btn cv2-decline-btn" onClick={() => socket.emit("useHoldingFreeCard")}>
                        Use Free Card
                      </button>
                    )}
                  </div>
                );
              }
              if (isMyTurn && !pending && state.canRollAgain) {
                return (
                  <button className="cv2-roll-btn" onClick={() => { primeAudio(); socket.emit("rollDice"); }}>
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
            {(() => {
              const isMyTurn = players[turnIndex]?.id === myId;
              const pending = state.pendingAction;
              const me = players.find((p) => p.id === myId);
              if (isMyTurn && !pending && me?.balance < 0) {
                return (
                  <p className="cv2-turn-status cv2-debt-warning">
                    You're ${Math.abs(me.balance)} in debt — mortgage or trade before ending your turn.
                  </p>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
