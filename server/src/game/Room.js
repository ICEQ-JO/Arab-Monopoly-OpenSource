import { nanoid } from "nanoid";
import { TILE_TYPES, BOARD, TOTAL_TILES, propertiesByGroup } from "./board.js";
import { SURPRISE_CARDS, TREASURE_CARDS, shuffledDeck } from "./cards.js";
import { ICON_IDS } from "./icons.js";

// Exported so the test suite can assert against these by name instead of
// hardcoding magic numbers that would silently drift out of sync if tuned here.
export const STARTING_BALANCE = 1500;
export const HOLDING_RELEASE_RENT = 50;
export const MAX_HOLDING_TURNS = 3;
export const TURN_TIME_LIMIT_MS = 4 * 60 * 1000;
export const DISCONNECT_GRACE_MS = 20 * 1000;
export const MORTGAGE_INTEREST_RATE = 0.1;
export const AUCTION_BASE_MS = 10 * 1000;
export const AUCTION_EXTEND_MS = 3 * 1000;

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#1abc9c"];

// "eight" and "eleven" start with a vowel sound; every other roll total (2-12) doesn't.
function article(n) {
  return n === 8 || n === 11 ? "an" : "a";
}

const DEFAULT_RULES = {
  vacationPot:       true,
  noRentInPrison:    true,
  evenBuild:         true,
  doubleRentFullSet: true,
  auction:           true,
  startingCash:      1500,
};

export class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this._board = BOARD;
    this._totalTiles = TOTAL_TILES;
    this._propertiesByGroup = propertiesByGroup;
    this._holdingTileId = BOARD.find((t) => t.type === TILE_TYPES.HOLDING)?.id;
    this.rules = { ...DEFAULT_RULES };
    this.vacationPot = 0;
    this.players = [];
    this.ownership = {};
    this.started = false;
    this.turnIndex = 0;
    this.surpriseDeck = shuffledDeck(SURPRISE_CARDS);
    this.treasureDeck = shuffledDeck(TREASURE_CARDS);
    this.log = [];
    this.lastRoll = null;
    this.pendingAction = null;
    this.winnerId = null;
    this.turnTimer = null;
    this.turnDeadline = null;
    this.notify = null;
    this.trades = [];
    this.auctions = [];
    this.canRollAgain = true;
    this.consecutiveDoubles = 0;
    this.rollSeq = 0;
  }

  updateSettings(hostId, { rules } = {}) {
    if (this.hostId !== hostId) return { error: "Only the host can change settings" };
    if (this.started) return { error: "Game already started" };
    if (rules) {
      for (const [k, v] of Object.entries(rules)) {
        if (k in DEFAULT_RULES) this.rules[k] = v;
      }
    }
    return { ok: true };
  }

  addPlayer(id, token, name = "", preferredColor = null) {
    if (this.players.find((p) => p.id === id)) return;
    const takenColors = this.players.map((p) => p.color);
    const fallback = PLAYER_COLORS[this.players.length % PLAYER_COLORS.length];
    const color = (preferredColor && !takenColors.includes(preferredColor))
      ? preferredColor
      : fallback;
    const seatNum = this.players.length + 1;
    this.players.push({
      id,
      token,
      name: name.trim() || `Seat ${seatNum}`,
      color,
      connected: true,
      graceTimer: null,
      balance: STARTING_BALANCE,
      position: 0,
      inHolding: false,
      holdingTurns: 0,
      holdingFreeCard: false,
      bankrupt: false,
      left: false,
      properties: [],
      icon: null,
    });
  }

  verifyToken(id, token) {
    const player = this.playerById(id);
    return !!player && player.token === token;
  }

  // Disconnects (not manual leaves) get a short window to come back before being kicked.
  startGracePeriod(playerId) {
    const player = this.playerById(playerId);
    if (!player || player.left || player.bankrupt) return;
    player.connected = false;
    this.pushLog(`${player.name} disconnected — they have ${DISCONNECT_GRACE_MS / 1000}s to reconnect before losing their seat.`);
    player.graceTimer = setTimeout(() => {
      player.graceTimer = null;
      this.kickPlayer(playerId, "didn't reconnect in time and was removed from the game");
      this.notify?.();
    }, DISCONNECT_GRACE_MS);
  }

  cancelGracePeriod(playerId) {
    const player = this.playerById(playerId);
    if (!player) return;
    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    player.connected = true;
    this.pushLog(`${player.name} reconnected.`);
  }

  // Used only pre-start: a lobby seat for a game that hasn't begun isn't worth holding.
  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
    for (const tileId of Object.keys(this.ownership)) {
      if (this.ownership[tileId].ownerId === id) delete this.ownership[tileId];
    }
    if (this.hostId === id && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }
  }

  // Used mid-game: disconnects, manual leaves, and turn-timeouts all forfeit the player's
  // seat (properties released to the bank) but keep them visible in the player list.
  kickPlayer(playerId, reasonLabel) {
    const player = this.playerById(playerId);
    if (!player || player.left || player.bankrupt) return;
    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    const wasCurrent = this.started && this.currentPlayer()?.id === playerId;
    for (const tileId of player.properties) {
      delete this.ownership[tileId];
    }
    player.properties = [];
    player.left = true;
    if (this.pendingAction?.playerId === playerId) this.pendingAction = null;
    this.clearTradesInvolving(playerId);
    this.clearAuctionBidsFrom(playerId);
    this.pushLog(`${player.name} ${reasonLabel}.`);
    this.checkWinner();
    if (!this.winnerId && wasCurrent) {
      this.endTurn();
    }
    if (this.hostId === playerId) {
      const next = this.activePlayers()[0];
      if (next) this.hostId = next.id;
    }
  }

  activePlayers() {
    return this.players.filter((p) => !p.bankrupt && !p.left);
  }

  checkWinner() {
    if (this.winnerId || !this.started) return;
    const remaining = this.activePlayers();
    if (remaining.length <= 1) {
      this.clearTurnTimer();
      if (remaining.length === 1) {
        this.winnerId = remaining[0].id;
        this.pushLog(`${remaining[0].name} wins the game!`);
      } else {
        this.pushLog("No players remaining — game over.");
      }
    }
  }

  currentPlayer() {
    return this.players[this.turnIndex];
  }

  pushLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 50) this.log.pop();
  }

  // Color is picked in-room (pre-game) rather than before joining -- each
  // player owns their own choice, the host has no special say over it.
  setPlayerColor(playerId, color) {
    const player = this.playerById(playerId);
    if (!player) return { error: "Not in this room" };
    if (this.started) return { error: "Game already started" };
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "Invalid color" };
    const taken = this.players.some((p) => p.id !== playerId && !p.left && p.color === color);
    if (taken) return { error: "Color already taken" };
    player.color = color;
    return { ok: true };
  }

  // Icon is purely cosmetic (the on-board token image) -- unlike color,
  // multiple players may share the same icon.
  setPlayerIcon(playerId, iconId) {
    const player = this.playerById(playerId);
    if (!player) return { error: "Not in this room" };
    if (this.started) return { error: "Game already started" };
    if (!ICON_IDS.includes(iconId)) return { error: "Invalid icon" };
    player.icon = iconId;
    return { ok: true };
  }

  start() {
    const startBalance = this.rules.startingCash ?? STARTING_BALANCE;
    for (const player of this.players) {
      player.balance = startBalance;
    }
    this.started = true;
    this.canRollAgain = true;
    this.consecutiveDoubles = 0;
    this.pushLog("Game started!");
    this.startTurnTimer();
  }

  startTurnTimer() {
    this.clearTurnTimer();
    const player = this.currentPlayer();
    if (!player) return;
    this.turnDeadline = Date.now() + TURN_TIME_LIMIT_MS;
    this.turnTimer = setTimeout(() => {
      this.kickPlayer(player.id, "ran out of time and was removed from the game");
      this.notify?.();
    }, TURN_TIME_LIMIT_MS);
  }

  clearTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadline = null;
  }

  clearAllAuctionTimers() {
    for (const auction of this.auctions) {
      if (auction.timer) clearTimeout(auction.timer);
    }
  }

  rollDice(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId || player.bankrupt || player.left) return { error: "Not your turn" };
    if (this.pendingAction) return { error: "Resolve the current action first" };
    if (!this.canRollAgain) return { error: "You already rolled this turn" };

    const wasInHolding = player.inHolding;
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.lastRoll = [d1, d2];
    this.rollSeq += 1;
    const rolledDoubles = d1 === d2;
    const total = d1 + d2;
    this.pushLog(`${player.name} rolled ${article(total)} ${total}.`);

    if (wasInHolding) {
      player.holdingTurns += 1;
      if (rolledDoubles) {
        player.inHolding = false;
        player.holdingTurns = 0;
        this.pushLog(`${player.name} rolled doubles and left the Holding Pen.`);
      } else if (player.holdingTurns >= MAX_HOLDING_TURNS) {
        player.balance -= HOLDING_RELEASE_RENT;
        player.inHolding = false;
        player.holdingTurns = 0;
        this.pushLog(`${player.name} paid ${HOLDING_RELEASE_RENT} to leave the Holding Pen.`);
      } else {
        this.pushLog(`${player.name} is stuck in the Holding Pen (${player.holdingTurns}/${MAX_HOLDING_TURNS}).`);
        this.canRollAgain = false;
        return { rolled: [d1, d2], stayedInHolding: true };
      }
    }

    // Doubles rolled to escape the Holding Pen don't count toward "three in a row" --
    // that rule is about free play, not the unrelated escape mechanic above.
    if (rolledDoubles && !wasInHolding) {
      this.consecutiveDoubles += 1;
    } else if (!rolledDoubles) {
      this.consecutiveDoubles = 0;
    }

    if (this.consecutiveDoubles >= 3) {
      this.pushLog(`${player.name} rolled doubles three times in a row and was sent straight to the Holding Pen!`);
      this.consecutiveDoubles = 0;
      this.canRollAgain = false;
      this.sendToHolding(player);
      return { rolled: [d1, d2], doubles: true, sentToHoldingForSpeeding: true };
    }

    const steps = d1 + d2;
    this.movePlayer(player, steps);

    // A card drawn during this move might be a movement card ("advance to X" /
    // "move N spaces") -- those don't resolve immediately, they wait on the player's
    // explicit confirmCardMove (see below). Stash the bonus-roll context on the
    // pendingAction itself so confirmCardMove can finish this calculation once the
    // deferred move actually happens, instead of deciding it prematurely here.
    if (this.pendingAction?.type === "awaitCardMove") {
      this.pendingAction.rolledDoubles = rolledDoubles;
      this.pendingAction.wasInHolding = wasInHolding;
      return { rolled: [d1, d2], doubles: rolledDoubles, awaitingCardMove: true };
    }

    // A bonus roll is earned only by rolling doubles in free play (not escaping the
    // Holding Pen, and not the third-in-a-row case already handled above) -- and not
    // if this same move just sent them to the Holding Pen (landing on the "go to
    // Holding" tile, or a card effect), re-checked here rather than trusting the
    // pre-move wasInHolding snapshot, since movePlayer can change it.
    this.canRollAgain = rolledDoubles && !wasInHolding && !player.inHolding;

    return { rolled: [d1, d2], doubles: rolledDoubles };
  }

  movePlayer(player, steps) {
    const prev = player.position;
    let next = (prev + steps) % this._totalTiles;
    if (next < 0) next += this._totalTiles;
    if (steps > 0 && next < prev) {
      player.balance += 200;
      this.pushLog(`${player.name} passed Start Plaza and collected 200 coins.`);
    }
    player.position = next;
    this.resolveTile(player);
  }

  resolveTile(player) {
    const tile = this._board[player.position];
    switch (tile.type) {
      case TILE_TYPES.START:
        break;
      case TILE_TYPES.PROPERTY:
      case TILE_TYPES.TRANSIT:
      case TILE_TYPES.UTILITY: {
        const owned = this.ownership[tile.id];
        if (!owned) {
          this.pendingAction = { type: "awaitBuy", tileId: tile.id, playerId: player.id };
        } else if (owned.ownerId !== player.id) {
          if (owned.mortgaged) {
            this.pushLog(`${player.name} landed on ${tile.name}, but it's mortgaged — no rent owed.`);
          } else if (this.rules.noRentInPrison && this.playerById(owned.ownerId)?.inHolding) {
            this.pushLog(`${player.name} landed on ${tile.name}, but the owner is in prison — no rent owed.`);
          } else {
            const rent = this.calcRent(tile, owned);
            this.transferMoney(player.id, owned.ownerId, rent);
            this.pushLog(`${player.name} paid ${rent} rent to ${this.playerById(owned.ownerId).name} for ${tile.name}.`);
          }
        }
        break;
      }
      case TILE_TYPES.TAX:
        player.balance -= tile.amount;
        if (this.rules.vacationPot) this.vacationPot += tile.amount;
        this.pushLog(`${player.name} paid ${tile.amount} coins toll at ${tile.name}.`);
        break;
      case TILE_TYPES.SURPRISE:
        this.drawCard(player, "surprise");
        break;
      case TILE_TYPES.TREASURE:
        this.drawCard(player, "treasure");
        break;
      case TILE_TYPES.GO_TO_HOLDING:
        this.sendToHolding(player);
        break;
      case TILE_TYPES.REST:
        if (this.rules.vacationPot && this.vacationPot > 0) {
          player.balance += this.vacationPot;
          this.pushLog(`${player.name} landed on Vacation and collected the pot of ${this.vacationPot} coins!`);
          this.vacationPot = 0;
        }
        break;
      case TILE_TYPES.HOLDING:
      default:
        break;
    }
    // Deliberately no bankruptcy check here -- a negative balance is now tolerated
    // mid-turn so the player gets a real chance to mortgage/sell/trade their way back
    // to solvent before it's actually enforced, at the end of *their own* turn (see
    // finishTurn / playerEndTurn).
  }

  calcRent(tile, owned) {
    if (tile.type === TILE_TYPES.PROPERTY) {
      const houses = owned.houses || 0;
      const groupTiles = this._propertiesByGroup(tile.group);
      const ownsAll = groupTiles.every((t) => this.ownership[t.id]?.ownerId === owned.ownerId);
      let rent = tile.rent[houses];
      if (houses === 0 && ownsAll && this.rules.doubleRentFullSet) rent *= 2;
      return rent;
    }
    if (tile.type === TILE_TYPES.TRANSIT) {
      const owner = owned.ownerId;
      const count = this._board.filter((t) => t.type === TILE_TYPES.TRANSIT && this.ownership[t.id]?.ownerId === owner).length;
      return tile.rent[Math.min(count - 1, tile.rent.length - 1)];
    }
    if (tile.type === TILE_TYPES.UTILITY) {
      const owner = owned.ownerId;
      const count = this._board.filter((t) => t.type === TILE_TYPES.UTILITY && this.ownership[t.id]?.ownerId === owner).length;
      const mult = tile.multiplier[Math.min(count - 1, tile.multiplier.length - 1)];
      const roll = (this.lastRoll?.[0] || 0) + (this.lastRoll?.[1] || 0);
      return mult * roll;
    }
    return 0;
  }

  drawCard(player, deckName) {
    const deckKey = deckName === "surprise" ? "surpriseDeck" : "treasureDeck";
    if (this[deckKey].length === 0) {
      this[deckKey] = shuffledDeck(deckName === "surprise" ? SURPRISE_CARDS : TREASURE_CARDS);
    }
    const card = this[deckKey].shift();
    this.pushLog(`${player.name} drew: "${card.text}"`);
    this.applyCardEffect(player, card.effect);
    this.lastCard = { deck: deckName, text: card.text };
  }

  applyCardEffect(player, effect) {
    switch (effect.type) {
      case "pay":
        player.balance -= effect.amount;
        if (this.rules.vacationPot) this.vacationPot += effect.amount;
        break;
      case "collect":
        player.balance += effect.amount;
        break;
      case "payEachPlayer":
        for (const other of this.players) {
          if (other.id !== player.id && !other.bankrupt) {
            this.transferMoney(player.id, other.id, effect.amount);
          }
        }
        break;
      case "collectFromEachPlayer":
        for (const other of this.players) {
          if (other.id !== player.id && !other.bankrupt) {
            this.transferMoney(other.id, player.id, effect.amount);
          }
        }
        break;
      case "advanceTo":
      case "move":
        // Movement cards don't move the player in the same beat the card is drawn --
        // they wait on an explicit confirmCardMove (the player can't decline, but they
        // do get to see the card's text before the board changes under them).
        this.pendingAction = { type: "awaitCardMove", playerId: player.id, effect };
        break;
      case "goToHolding":
        this.sendToHolding(player);
        break;
      case "getOutFree":
        player.holdingFreeCard = true;
        break;
      case "repair": {
        let total = 0;
        for (const tileId of player.properties) {
          const houses = this.ownership[tileId]?.houses || 0;
          total += houses === 5 ? effect.hotel : houses * effect.house;
        }
        player.balance -= total;
        break;
      }
      default:
        break;
    }
  }

  sendToHolding(player) {
    if (player.holdingFreeCard) {
      player.holdingFreeCard = false;
      this.pushLog(`${player.name} used a free pass to avoid the Holding Pen.`);
      return;
    }
    player.position = this._holdingTileId;
    player.inHolding = true;
    player.holdingTurns = 0;
    this.pushLog(`${player.name} was sent to the Holding Pen.`);
  }

  // Voluntary alternative to rolling for doubles -- a player stuck in the Holding
  // Pen can pay the fine on their own turn instead of waiting it out, freeing them
  // to roll and move normally for the rest of this same turn.
  payToLeaveHolding(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) return { error: "Not your turn" };
    if (!player.inHolding) return { error: "You're not in the Holding Pen" };
    if (player.balance < HOLDING_RELEASE_RENT) return { error: "Not enough coins" };
    player.balance -= HOLDING_RELEASE_RENT;
    player.inHolding = false;
    player.holdingTurns = 0;
    this.pushLog(`${player.name} paid ${HOLDING_RELEASE_RENT} coins to leave the Holding Pen.`);
    return { ok: true };
  }

  useHoldingFreeCard(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) return { error: "Not your turn" };
    if (!player.inHolding) return { error: "You're not in the Holding Pen" };
    if (!player.holdingFreeCard) return { error: "You don't have a Get Out of Jail Free card" };
    player.holdingFreeCard = false;
    player.inHolding = false;
    player.holdingTurns = 0;
    this.pushLog(`${player.name} used a Get Out of Jail Free card to leave the Holding Pen.`);
    return { ok: true };
  }

  // Resolves a movement card ("advance to X" / "move N spaces") that's been sitting
  // in pendingAction since the card was drawn -- the player can't decline it, but
  // this gives them a beat to actually read the card before the board updates,
  // instead of the move completing invisibly in the same instant the card flips.
  confirmCardMove(playerId) {
    if (!this.pendingAction || this.pendingAction.type !== "awaitCardMove" || this.pendingAction.playerId !== playerId) {
      return { error: "No card move to confirm" };
    }
    const { effect, rolledDoubles, wasInHolding } = this.pendingAction;
    const player = this.playerById(playerId);
    this.pendingAction = null;
    if (effect.type === "advanceTo") {
      player.position = effect.tile;
      if (effect.collectStart) player.balance += 200;
      this.resolveTile(player);
    } else {
      this.movePlayer(player, effect.steps);
    }
    // Only finish the deferred bonus-roll calculation if nothing else (a fresh
    // awaitBuy, or another awaitCardMove from a chained card) is now blocking the turn.
    if (!this.pendingAction) {
      this.canRollAgain = !!rolledDoubles && !wasInHolding && !player.inHolding;
    }
    return { ok: true };
  }

  buyProperty(playerId) {
    if (!this.pendingAction || this.pendingAction.type !== "awaitBuy" || this.pendingAction.playerId !== playerId) {
      return { error: "No property to buy" };
    }
    const player = this.playerById(playerId);
    const tile = this._board[this.pendingAction.tileId];
    if (player.balance < tile.price) return { error: "Not enough coins" };
    player.balance -= tile.price;
    player.properties.push(tile.id);
    this.ownership[tile.id] = { ownerId: playerId, houses: 0 };
    this.pushLog(`${player.name} bought ${tile.name} for ${tile.price} coins.`);
    this.pendingAction = null;
    return { ok: true };
  }

  declineBuy(playerId) {
    if (!this.pendingAction || this.pendingAction.type !== "awaitBuy" || this.pendingAction.playerId !== playerId) {
      return { error: "No property to decline" };
    }
    const tileId = this.pendingAction.tileId;
    this.pushLog(`${this.playerById(playerId).name} declined to buy ${this._board[tileId].name}.`);
    this.pendingAction = null;
    if (this.rules.auction) this.startAuction(tileId);
    return { ok: true };
  }

  // Opens bidding to every active player (including whoever just declined). Several
  // auctions can be open at once -- e.g. a turn-timeout kick can hand the turn to a new
  // player who immediately lands on a different unowned tile before the first auction
  // closes -- so each gets its own independent id rather than sharing one slot.
  startAuction(tileId) {
    const auction = {
      id: nanoid(),
      tileId,
      highestBid: 0,
      highestBidderId: null,
      passedIds: [],
      deadline: Date.now() + AUCTION_BASE_MS,
      timer: null,
    };
    this.auctions.push(auction);
    this.pendingAction = { type: "auction", tileId, auctionId: auction.id, playerId: this.currentPlayer()?.id };
    this.pushLog(`${this._board[tileId].name} is up for auction!`);
    this.scheduleAuctionTimer(auction.id);
  }

  // Without this, an auction with no clear unanimous-pass would sit open forever
  // (real players don't always explicitly pass once they've lost interest). Every
  // auction has a 10s base window from when it opens; each bid extends the deadline
  // to at least 3s after that bid, so a flurry of late bids can't cut each other
  // off mid-exchange, but bidding has to actually go quiet for the clock to run out.
  scheduleAuctionTimer(auctionId) {
    const auction = this.auctions.find((a) => a.id === auctionId);
    if (!auction) return;
    if (auction.timer) clearTimeout(auction.timer);
    const delay = Math.max(0, auction.deadline - Date.now());
    auction.timer = setTimeout(() => {
      auction.timer = null;
      this.resolveAuction(auctionId);
      this.notify?.();
    }, delay);
  }

  placeBid(playerId, auctionId, amount) {
    const auction = this.auctions.find((a) => a.id === auctionId);
    if (!auction) return { error: "Auction not found" };
    const player = this.playerById(playerId);
    if (!player || player.bankrupt || player.left) return { error: "You can't bid right now" };
    if (auction.passedIds.includes(playerId)) return { error: "You already passed on this auction" };
    if (!Number.isInteger(amount) || amount <= auction.highestBid) {
      return { error: "Bid must be higher than the current highest bid" };
    }
    if (amount > player.balance) return { error: "Not enough coins" };
    auction.highestBid = amount;
    auction.highestBidderId = playerId;
    auction.deadline = Math.max(auction.deadline, Date.now() + AUCTION_EXTEND_MS);
    this.scheduleAuctionTimer(auction.id);
    this.pushLog(`${player.name} bid ${amount} coins on ${this._board[auction.tileId].name}.`);
    this.maybeResolveAuction(auction.id);
    return { ok: true };
  }

  passAuction(playerId, auctionId) {
    const auction = this.auctions.find((a) => a.id === auctionId);
    if (!auction) return { error: "Auction not found" };
    if (!auction.passedIds.includes(playerId)) {
      auction.passedIds.push(playerId);
      this.pushLog(`${this.playerById(playerId)?.name ?? "A player"} passed on ${this._board[auction.tileId].name}.`);
      this.maybeResolveAuction(auction.id);
    }
    return { ok: true };
  }

  // Resolves once nobody's left to bid (no one bid at all -> stays unowned), or once
  // exactly one active bidder remains *and* they're the current high bidder -- if they
  // haven't bid yet, the auction waits for them to actually act (bid or pass) rather
  // than handing them the property without a chance to choose.
  maybeResolveAuction(auctionId) {
    const auction = this.auctions.find((a) => a.id === auctionId);
    if (!auction) return;
    const remaining = this.activePlayers().filter((p) => !auction.passedIds.includes(p.id));
    if (remaining.length === 0 || (remaining.length === 1 && remaining[0].id === auction.highestBidderId)) {
      this.resolveAuction(auctionId);
    }
  }

  resolveAuction(auctionId) {
    const auction = this.auctions.find((a) => a.id === auctionId);
    if (!auction) return;
    if (auction.timer) clearTimeout(auction.timer);
    this.auctions = this.auctions.filter((a) => a.id !== auctionId);
    const tile = this._board[auction.tileId];
    if (auction.highestBidderId) {
      const winner = this.playerById(auction.highestBidderId);
      winner.balance -= auction.highestBid;
      winner.properties.push(auction.tileId);
      this.ownership[auction.tileId] = { ownerId: auction.highestBidderId, houses: 0 };
      this.pushLog(`${winner.name} won the auction for ${tile.name} at ${auction.highestBid} coins.`);
      // No immediate bankruptcy check here either, same reasoning as resolveTile --
      // the winner's balance could in theory have dropped between bidding and this
      // auction resolving; if that pushes them negative, it's caught at their own
      // next turn-end, not here.
    } else {
      this.pushLog(`No bids for ${tile.name} -- it remains unowned.`);
    }
    if (this.pendingAction?.type === "auction" && this.pendingAction.auctionId === auctionId) {
      this.pendingAction = null;
    }
  }

  // A kicked/bankrupt player can't be left holding the high bid (or a live seat at the
  // table) on an auction that hasn't closed yet -- voids their bid and treats them as
  // having passed, then re-checks whether that auction can now resolve.
  clearAuctionBidsFrom(playerId) {
    for (const auction of this.auctions) {
      if (auction.highestBidderId === playerId) {
        auction.highestBidderId = null;
        auction.highestBid = 0;
        this.pushLog(`A voided bid reopened the auction for ${this._board[auction.tileId].name}.`);
      }
      if (!auction.passedIds.includes(playerId)) auction.passedIds.push(playerId);
      this.maybeResolveAuction(auction.id);
    }
  }

  buyHouse(playerId, tileId) {
    const tile = this._board[tileId];
    const owned = this.ownership[tileId];
    if (!owned || owned.ownerId !== playerId || tile.type !== TILE_TYPES.PROPERTY) {
      return { error: "You do not own this property" };
    }
    if (owned.mortgaged) return { error: "You can't build on a mortgaged property" };
    const groupTiles = this._propertiesByGroup(tile.group);
    const ownsAll = groupTiles.every((t) => this.ownership[t.id]?.ownerId === playerId);
    if (!ownsAll) return { error: "You must own the full color group" };
    if (owned.houses >= 5) return { error: "Already at max (hotel)" };
    if (this.rules.evenBuild) {
      const groupTiles = this._propertiesByGroup(tile.group);
      const minHouses = Math.min(...groupTiles.map((t) => this.ownership[t.id]?.houses || 0));
      if (owned.houses > minHouses) return { error: "Build evenly — upgrade another property in this group first" };
    }
    const player = this.playerById(playerId);
    if (player.balance < tile.housePrice) return { error: "Not enough coins" };
    player.balance -= tile.housePrice;
    owned.houses += 1;
    this.pushLog(`${player.name} built on ${tile.name} (level ${owned.houses}).`);
    return { ok: true };
  }

  sellHouse(playerId, tileId) {
    const tile = this._board[tileId];
    const owned = this.ownership[tileId];
    if (!owned || owned.ownerId !== playerId || tile.type !== TILE_TYPES.PROPERTY) {
      return { error: "You do not own this property" };
    }
    if (!owned.houses) return { error: "There's nothing built here to sell" };
    if (this.rules.evenBuild) {
      const groupTiles = this._propertiesByGroup(tile.group);
      const maxHouses = Math.max(...groupTiles.map((t) => this.ownership[t.id]?.houses || 0));
      if (owned.houses < maxHouses) return { error: "Sell evenly — downgrade another property in this group first" };
    }
    const player = this.playerById(playerId);
    const refund = Math.floor(tile.housePrice / 2);
    owned.houses -= 1;
    player.balance += refund;
    this.pushLog(`${player.name} sold a house on ${tile.name} for ${refund} coins (now level ${owned.houses}).`);
    return { ok: true };
  }

  mortgageProperty(playerId, tileId) {
    const tile = this._board[tileId];
    const owned = this.ownership[tileId];
    if (!owned || owned.ownerId !== playerId || !tile?.price) {
      return { error: "You do not own this property" };
    }
    if (owned.mortgaged) return { error: "Already mortgaged" };
    if (owned.houses) return { error: "Sell all houses on this property first" };
    const player = this.playerById(playerId);
    const value = Math.floor(tile.price / 2);
    owned.mortgaged = true;
    player.balance += value;
    this.pushLog(`${player.name} mortgaged ${tile.name} for ${value} coins.`);
    return { ok: true };
  }

  unmortgageProperty(playerId, tileId) {
    const tile = this._board[tileId];
    const owned = this.ownership[tileId];
    if (!owned || owned.ownerId !== playerId || !owned.mortgaged) {
      return { error: "This property isn't mortgaged" };
    }
    const player = this.playerById(playerId);
    const cost = this.unmortgageCost(tileId);
    if (player.balance < cost) return { error: "Not enough coins" };
    player.balance -= cost;
    owned.mortgaged = false;
    this.pushLog(`${player.name} paid off the mortgage on ${tile.name} for ${cost} coins.`);
    return { ok: true };
  }

  unmortgageCost(tileId) {
    const tile = this._board[tileId];
    const value = Math.floor(tile.price / 2);
    return value + Math.ceil(value * MORTGAGE_INTEREST_RATE);
  }

  transferMoney(fromId, toId, amount) {
    const from = this.playerById(fromId);
    const to = this.playerById(toId);
    from.balance -= amount;
    to.balance += amount;
  }

  // A property can only be traded while it's undeveloped and unmortgaged -- avoids
  // juggling house counts or mortgage transfer across a swap (real rules also
  // require selling houses, and often paying off the mortgage, before trading).
  isTradeable(tileId, ownerId) {
    const owned = this.ownership[tileId];
    const tile = this._board[tileId];
    if (!owned || owned.ownerId !== ownerId || !tile) return false;
    if (tile.type !== TILE_TYPES.PROPERTY && tile.type !== TILE_TYPES.TRANSIT && tile.type !== TILE_TYPES.UTILITY) return false;
    return !owned.houses && !owned.mortgaged;
  }

  // Shared validation for any new trade, whether it's a fresh proposal or a
  // counter-offer replacing one. Returns { trade } on success, { error } otherwise --
  // never mutates this.trades itself, so callers decide what to do with the result.
  buildTrade(fromId, { toId, offerProperties = [], offerMoney = 0, requestProperties = [], requestMoney = 0 }) {
    const fromPlayer = this.playerById(fromId);
    const toPlayer = this.playerById(toId);
    if (!fromPlayer || fromPlayer.bankrupt || fromPlayer.left) return { error: "You can't trade right now" };
    if (!toPlayer || toPlayer.bankrupt || toPlayer.left || toId === fromId) return { error: "Invalid trade partner" };
    if (!Number.isInteger(offerMoney) || offerMoney < 0 || !Number.isInteger(requestMoney) || requestMoney < 0) {
      return { error: "Coin amounts must be non-negative whole numbers" };
    }
    if (offerProperties.length === 0 && requestProperties.length === 0 && offerMoney === 0 && requestMoney === 0) {
      return { error: "A trade needs to include at least one property or coins" };
    }
    if (!offerProperties.every((id) => this.isTradeable(id, fromId))) {
      return { error: "You can only offer undeveloped properties you own" };
    }
    if (!requestProperties.every((id) => this.isTradeable(id, toId))) {
      return { error: "You can only request undeveloped properties they own" };
    }
    return {
      trade: { id: nanoid(), fromId, toId, offerProperties, offerMoney, requestProperties, requestMoney },
    };
  }

  proposeTrade(fromId, params) {
    const result = this.buildTrade(fromId, params);
    if (result.error) return result;
    this.trades.push(result.trade);
    this.pushLog(`${this.playerById(fromId).name} proposed a trade with ${this.playerById(result.trade.toId).name}.`);
    return { ok: true, tradeId: result.trade.id };
  }

  // The recipient of a trade can counter instead of just accepting/declining --
  // this replaces the original offer with a new one in the opposite direction
  // (counterer becomes fromId, original proposer becomes toId), going through the
  // exact same validation a fresh proposal would.
  counterTrade(playerId, tradeId, params) {
    const original = this.trades.find((t) => t.id === tradeId && t.toId === playerId);
    if (!original) return { error: "Trade not found" };
    const result = this.buildTrade(playerId, { ...params, toId: original.fromId });
    if (result.error) return result;
    this.trades = this.trades.filter((t) => t.id !== tradeId);
    result.trade.counterOf = tradeId;
    this.trades.push(result.trade);
    this.pushLog(`${this.playerById(playerId).name} countered ${this.playerById(original.fromId).name}'s trade offer.`);
    return { ok: true, tradeId: result.trade.id };
  }

  respondTrade(playerId, tradeId, accept) {
    const trade = this.trades.find((t) => t.id === tradeId && t.toId === playerId);
    if (!trade) return { error: "Trade not found" };
    this.trades = this.trades.filter((t) => t.id !== tradeId);

    const fromPlayer = this.playerById(trade.fromId);
    const toPlayer = this.playerById(trade.toId);

    if (!accept) {
      this.pushLog(`${toPlayer.name} declined ${fromPlayer.name}'s trade offer.`);
      return { ok: true };
    }

    // Re-validate everything: ownership, development, and funds may have all
    // changed in the time between the offer being made and being accepted.
    if (!fromPlayer || fromPlayer.bankrupt || fromPlayer.left || !toPlayer || toPlayer.bankrupt || toPlayer.left) {
      return { error: "One of the players is no longer in the game" };
    }
    if (!trade.offerProperties.every((id) => this.isTradeable(id, trade.fromId))) {
      return { error: "The offer is no longer valid" };
    }
    if (!trade.requestProperties.every((id) => this.isTradeable(id, trade.toId))) {
      return { error: "The request is no longer valid" };
    }
    // Only actually giving money away requires affording it -- offering/requesting
    // $0 must never fail this check just because the player's current balance
    // happens to be negative (a trade is one of the few ways an indebted player can
    // legitimately recover, by *receiving* money, so a $0 offer must be exempt).
    if ((trade.offerMoney > 0 && fromPlayer.balance < trade.offerMoney) ||
      (trade.requestMoney > 0 && toPlayer.balance < trade.requestMoney)) {
      return { error: "One of the players can no longer afford this trade" };
    }

    for (const tileId of trade.offerProperties) {
      this.ownership[tileId].ownerId = trade.toId;
      fromPlayer.properties = fromPlayer.properties.filter((id) => id !== tileId);
      toPlayer.properties.push(tileId);
    }
    for (const tileId of trade.requestProperties) {
      this.ownership[tileId].ownerId = trade.fromId;
      toPlayer.properties = toPlayer.properties.filter((id) => id !== tileId);
      fromPlayer.properties.push(tileId);
    }
    if (trade.offerMoney > 0) this.transferMoney(trade.fromId, trade.toId, trade.offerMoney);
    if (trade.requestMoney > 0) this.transferMoney(trade.toId, trade.fromId, trade.requestMoney);

    this.pushLog(`${fromPlayer.name} and ${toPlayer.name} completed a trade.`);
    // No bankruptcy check here -- the funds check just above already guarantees
    // neither side goes negative from this trade itself.
    return { ok: true };
  }

  cancelTrade(playerId, tradeId) {
    const trade = this.trades.find((t) => t.id === tradeId && t.fromId === playerId);
    if (!trade) return { error: "Trade not found" };
    this.trades = this.trades.filter((t) => t.id !== tradeId);
    this.pushLog(`${this.playerById(playerId).name} cancelled their trade offer.`);
    return { ok: true };
  }

  // Trades referencing a player who's no longer active would otherwise dangle forever.
  clearTradesInvolving(playerId) {
    this.trades = this.trades.filter((t) => t.fromId !== playerId && t.toId !== playerId);
  }

  // Bankruptcy is no longer triggered automatically the instant a balance dips
  // below zero -- a negative balance is now tolerated for as long as it takes to
  // mortgage, sell houses, or trade your way back to solvent (none of those are
  // turn-gated, so that's possible even before your own turn comes back around).
  // This method still does the actual forfeiture *when called*; what changed is
  // when it's called -- see finishTurn, the only remaining call site.
  checkBankruptcy(player) {
    if (player.balance < 0 && !player.bankrupt) {
      player.bankrupt = true;
      for (const tileId of player.properties) {
        delete this.ownership[tileId];
      }
      player.properties = [];
      this.clearTradesInvolving(player.id);
      this.clearAuctionBidsFrom(player.id);
      this.pushLog(`${player.name} went bankrupt!`);
      this.checkWinner();
    }
  }

  // Ends the current player's turn via the player-facing playerEndTurn action.
  // Finalizes their bankruptcy first if they're still in the red, then advances
  // to the next player. (kickPlayer has its own similar but distinct path since
  // it calls endTurn() directly and skips the bankruptcy check -- a kicked
  // player is already handled separately.)
  finishTurn(player) {
    if (player.balance < 0) this.checkBankruptcy(player);
    if (!this.winnerId) this.endTurn();
  }

  // The player-facing "End turn" action -- unlike the internal endTurn() below
  // (also called by kickPlayer, neither of which should require a prior roll),
  // this enforces that rolling is mandatory: you can't just pass through your
  // turn without ever rolling the dice.
  playerEndTurn(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId) return { error: "Not your turn" };
    if (this.pendingAction) return { error: "Resolve the current action first" };
    if (!this.lastRoll) return { error: "Roll the dice before ending your turn" };
    this.finishTurn(player);
    return { ok: true };
  }

  endTurn() {
    this.clearTurnTimer();
    this.pendingAction = null;
    if (this.activePlayers().length <= 1) return;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
    } while (this.players[this.turnIndex].bankrupt || this.players[this.turnIndex].left);
    this.lastRoll = null;
    this.lastCard = null;
    this.canRollAgain = true;
    this.consecutiveDoubles = 0;
    this.startTurnTimer();
  }

  playerById(id) {
    return this.players.find((p) => p.id === id);
  }

  toState() {
    return {
      code: this.code,
      hostId: this.hostId,
      started: this.started,
      turnIndex: this.turnIndex,
      players: this.players.map(({ token, graceTimer, ...pub }) => pub),
      ownership: this.ownership,
      log: this.log.slice(0, 20),
      lastRoll: this.lastRoll,
      lastCard: this.lastCard,
      pendingAction: this.pendingAction,
      winnerId: this.winnerId,
      turnDeadline: this.turnDeadline,
      trades: this.trades,
      auctions: this.auctions.map(({ timer, ...pub }) => pub),
      canRollAgain: this.canRollAgain,
      board: this._board,
      rollSeq: this.rollSeq,
      rules: this.rules,
      vacationPot: this.vacationPot,
    };
  }

  // Full private save-to-disk dump -- unlike toState(), this keeps each player's
  // token (needed so a rejoinRoom after a restart can still prove identity) and
  // drops only what genuinely can't survive a restart: live setTimeout handles.
  toSnapshot() {
    return {
      code: this.code,
      hostId: this.hostId,
      started: this.started,
      turnIndex: this.turnIndex,
      players: this.players.map(({ graceTimer, ...rest }) => rest),
      ownership: this.ownership,
      surpriseDeck: this.surpriseDeck,
      treasureDeck: this.treasureDeck,
      log: this.log,
      lastRoll: this.lastRoll,
      lastCard: this.lastCard,
      pendingAction: this.pendingAction,
      winnerId: this.winnerId,
      trades: this.trades,
      auctions: this.auctions.map(({ timer, ...rest }) => rest),
      canRollAgain: this.canRollAgain,
      consecutiveDoubles: this.consecutiveDoubles,
      rollSeq: this.rollSeq,
      rules: this.rules,
      vacationPot: this.vacationPot,
    };
  }

  // Rebuilds a Room from a toSnapshot() dump (e.g. after a server restart). Two
  // things can't simply be restored as-is, since they depended on timer handles
  // that no longer exist:
  //  - Anyone mid-disconnect-grace when the snapshot was taken has no way to
  //    resume that exact window post-restart, so the restart itself is treated
  //    as the grace period running out.
  //  - The current player's turn timer is re-armed for a fresh full duration
  //    rather than trying to preserve exactly how much time was left.
  static fromSnapshot(snapshot) {
    const room = new Room(snapshot.code, snapshot.hostId);
    if (snapshot.rules) room.rules = { ...DEFAULT_RULES, ...snapshot.rules };
    if (snapshot.vacationPot !== undefined) room.vacationPot = snapshot.vacationPot;
    room.started = snapshot.started;
    room.turnIndex = snapshot.turnIndex;
    room.players = snapshot.players.map((p) => ({ ...p, graceTimer: null }));
    room.ownership = snapshot.ownership;
    room.surpriseDeck = snapshot.surpriseDeck;
    room.treasureDeck = snapshot.treasureDeck;
    room.log = snapshot.log;
    room.lastRoll = snapshot.lastRoll;
    room.lastCard = snapshot.lastCard;
    room.pendingAction = snapshot.pendingAction;
    room.winnerId = snapshot.winnerId;
    room.trades = snapshot.trades || [];
    // Same simplification as the turn timer below: old timer handles are gone, so
    // each restored auction gets a fresh full base window rather than trying to
    // preserve exactly how much time was left.
    room.auctions = (snapshot.auctions || []).map((a) => ({ ...a, timer: null, deadline: Date.now() + AUCTION_BASE_MS }));
    room.canRollAgain = snapshot.canRollAgain ?? true;
    room.consecutiveDoubles = snapshot.consecutiveDoubles || 0;
    room.rollSeq = snapshot.rollSeq || 0;

    for (const player of room.players) {
      if (!player.connected && !player.left && !player.bankrupt) {
        room.kickPlayer(player.id, "was disconnected when the server restarted and was removed from the game");
      }
    }
    if (room.started && !room.winnerId) {
      room.startTurnTimer();
    }
    for (const auction of room.auctions) {
      room.scheduleAuctionTimer(auction.id);
    }
    return room;
  }
}

export function generateRoomCode() {
  return nanoid(6).toUpperCase();
}
