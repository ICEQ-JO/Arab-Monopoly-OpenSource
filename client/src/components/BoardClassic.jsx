import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// A move only needs to stop at the corners it turns at, not every tile it
// passes over -- the rim is straight between corners, so gliding straight
// to each corner (rather than snapping tile by tile) is what lets the
// token move continuously instead of visibly stopping along the way. Each
// leg also carries how many original tiles it covers, so a long straight
// run can be given proportionally more time than a short one -- otherwise
// a leg crossing 10 tiles would take exactly as long as one crossing 1.
function computeLegWaypoints(from, to, sideLen, totalTiles) {
  const path = computeForwardPath(from, to, totalTiles);
  const legs = [];
  let legStart = 0;
  path.forEach((tileId, idx) => {
    const isCorner = tileId % sideLen === 0;
    if (isCorner || idx === path.length - 1) {
      legs.push({ tileId, tileCount: idx + 1 - legStart });
      legStart = idx + 1;
    }
  });
  return legs;
}

// A single leg eases in and out on its own (feels natural in the very
// common case of a move that only crosses one edge). For a move spanning
// several legs, only the first eases in and only the last eases out --
// the legs in between run at constant speed -- so the whole multi-leg trip
// reads as one continuous accelerate/cruise/decelerate motion instead of
// visibly re-accelerating at every corner it passes through.
// Sharp accelerate-in, snappy expo-out settle -- reads as "fast, but lands
// smooth" instead of the generic ease-in-out/ease-out keyword curves, which
// decelerate too gradually for a quick per-tile hop.
const LEG_EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const LEG_EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const LEG_EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

function legEasing(index, total) {
  if (total === 1) return LEG_EASE_IN_OUT;
  if (index === 0) return LEG_EASE_IN;
  if (index === total - 1) return LEG_EASE_OUT;
  return "linear";
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
      {!isCorner && groupColor && !owned?.mortgaged && <div className="cv2-band" style={{ background: groupColor }} />}
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
        <div className={`cv2-building-badge${isHotel ? " cv2-building-badge--hotel" : ""}`}>
          {isHotel ? (
            <span
              className="cv2-building-icon cv2-building-icon--hotel"
              style={{ "--icon-url": "url(/icons/hotel.svg)" }}
            />
          ) : (
            Array.from({ length: houses }, (_, i) => (
              <span
                key={i}
                className="cv2-building-icon"
                style={{ "--icon-url": "url(/icons/house.svg)" }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Renders every occupied tile's token stack in a single board-wide overlay,
// as a sibling of the tiles rather than nested inside one (so a token is
// never clipped by a tile's own `overflow: hidden` while elevated/stacked).
// Grouped by `visualPositions` (the tile a token's glide has currently
// reached -- see BoardClassic below), not the authoritative
// `player.position`; the two only match once a glide finishes. Every
// player always has exactly one current tile, in flight or not, so
// stacking (stackIndex/stackTotal) works the same way whether a token is
// sitting still or mid-glide through the tile it's passing.
function TokenLayer({ players, sideLen, trackCenters, currentPlayerId, visualPositions, floatingIds, landingIds, celebratingIds }) {
  const byTile = new Map();
  players.forEach((p) => {
    if (p.bankrupt || p.left) return;
    const entry = visualPositions.get(p.id);
    if (entry == null) return;
    if (!byTile.has(entry.tileId)) byTile.set(entry.tileId, []);
    byTile.get(entry.tileId).push({ player: p, glideMs: entry.glideMs, glideEase: entry.glideEase });
  });

  return (
    <div className="cv2-token-layer">
      {[...byTile.entries()].flatMap(([tileId, occupants]) => {
        const { row, col } = getLayout(tileId, sideLen);
        const leftPct = trackCenters[col - 1];
        const topPct = trackCenters[row - 1];
        return occupants.map(({ player: p, glideMs, glideEase }, i) => (
          <PlayerToken
            key={p.id}
            player={p}
            stackIndex={i}
            stackTotal={occupants.length}
            leftPct={leftPct}
            topPct={topPct}
            glideMs={glideMs}
            glideEase={glideEase}
            isMoving={floatingIds.has(p.id)}
            isLanding={landingIds.has(p.id)}
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

  // Rim tracks (row 1 / row N / col 1 / col N) are wider than inner tracks so
  // tiles take up more of the board and the center shrinks. Tiles become
  // rectangular as a result (taller on top/bottom, wider on left/right) --
  // confirmed look via prototype before implementing. Computed up front
  // (not just where gridTemplate needs it below) because the token-glide
  // effect further down also needs trackCenters to convert a tile id into
  // an on-screen coordinate. Memoized on board.length alone (it never
  // actually changes mid-game) -- without this, buildTrackCenters ran fresh
  // on every render for any reason at all (opening a tile card, the dice
  // tick, someone else's unrelated action), and since trackCenters sat in
  // the glide effect's dependency array below, every single one of those
  // renders tore down and restarted that effect, killing every in-flight
  // glide mid-air.
  const RIM_FR = 1.7;
  const INNER_FR = 1;
  const { sideLen, N, trackCenters } = useMemo(() => {
    const sideLen = board.length / 4;
    const N = sideLen + 1;
    return { sideLen, N, trackCenters: buildTrackCenters(N, RIM_FR, INNER_FR) };
  }, [board.length]);

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

  // Detect per-player position/property-count changes across state
  // broadcasts (prev-ref idiom) to drive one-shot animations instead of a
  // continuous state-driven one. A move steps through only its corner
  // waypoints (computeLegWaypoints), not every tile -- each leg is a single
  // CSS transition (see .cv2-token in classicVintage.css, driven by the
  // --glide-ms/--glide-ease custom properties PlayerToken sets per token),
  // so the browser itself performs the interpolation instead of a hand
  // -rolled animation loop. This is deliberately the same "one entry per
  // player, advanced via a timer chain" shape the very first version of
  // this board used (proven reliable across many passes) -- the only
  // change from that baseline is stopping at corners instead of every
  // tile, and holding a constant-elevation float (floatingIds) for the
  // whole multi-leg move instead of a bounce fired once on arrival.
  // If the move came from a dice roll (rollSeq changed in this same
  // update), it waits for the dice's own 1s tumble animation to finish
  // before the token sets off.
  const MS_PER_TILE = 70;
  const LEG_MIN_MS = 220;
  const LEG_MAX_MS = 650;
  const [visualPositions, setVisualPositions] = useState(
    () => new Map(players.map((p) => [p.id, { tileId: p.position, glideMs: 0, glideEase: "ease" }]))
  );
  const [floatingIds, setFloatingIds] = useState(() => new Set());
  // Held briefly right after floatingIds drops a player, so the token
  // transitions smoothly back down to its idle bob baseline instead of
  // snapping -- removing --floating has no transition of its own to ride
  // (its transition rule lives only on the --floating class itself, and the
  // idle bob keyframe animation that resumes after it takes over `transform`
  // outright, so without this in-between state the landing was an instant cut).
  const [landingIds, setLandingIds] = useState(() => new Set());
  const LANDING_MS = 220;
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
          const legs = computeLegWaypoints(from, to, sideLen, board.length);
          setFloatingIds((s) => new Set(s).add(id));
          let i = 0;
          const stepLeg = () => {
            if (i >= legs.length) {
              setFloatingIds((s) => {
                const next = new Set(s); next.delete(id); return next;
              });
              setLandingIds((s) => new Set(s).add(id));
              timers.push(setTimeout(() => {
                setLandingIds((s) => {
                  const next = new Set(s); next.delete(id); return next;
                });
              }, LANDING_MS));
              return;
            }
            const { tileId, tileCount } = legs[i];
            const glideMs = Math.min(LEG_MAX_MS, Math.max(LEG_MIN_MS, tileCount * MS_PER_TILE));
            const glideEase = legEasing(i, legs.length);
            setVisualPositions((m) => new Map(m).set(id, { tileId, glideMs, glideEase }));
            i += 1;
            timers.push(setTimeout(stepLeg, glideMs));
          };
          stepLeg();
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
  }, [players, rollSeq, board.length, sideLen, trackCenters]);

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
          floatingIds={floatingIds}
          landingIds={landingIds}
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

        <div className="cv2-center" style={{ gridRow: `2 / ${N}`, gridColumn: `2 / ${N}` }}>
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
            {/* Dev-only: teleports every active player onto one random tile
                to check the same-tile token-stacking UI without playing a
                real game up to the point where players naturally collide. */}
            <button
              className="cv2-debug-stack-btn"
              onClick={() => socket.emit("debugStackOnRandomTile")}
            >
              Test: stack all players on a random tile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
