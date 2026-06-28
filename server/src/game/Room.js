import { nanoid } from "nanoid";
import { BOARD, TILE_TYPES, TOTAL_TILES, propertiesByGroup } from "./board.js";
import { SURPRISE_CARDS, TREASURE_CARDS, shuffledDeck } from "./cards.js";

const STARTING_BALANCE = 1500;
const HOLDING_RELEASE_RENT = 50;
const MAX_HOLDING_TURNS = 3;
const TURN_TIME_LIMIT_MS = 4 * 60 * 1000;
const DISCONNECT_GRACE_MS = 20 * 1000;
const MORTGAGE_INTEREST_RATE = 0.1;

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#1abc9c"];

export class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = []; // {id, token, name, color, connected, balance, position, inHolding, holdingTurns, holdingFreeCard, bankrupt, left, properties: [tileId]}
    this.ownership = {}; // tileId -> { ownerId, houses }
    this.started = false;
    this.turnIndex = 0;
    this.surpriseDeck = shuffledDeck(SURPRISE_CARDS);
    this.treasureDeck = shuffledDeck(TREASURE_CARDS);
    this.log = [];
    this.lastRoll = null;
    this.pendingAction = null; // { type: 'awaitBuy'|'awaitRent'..., tileId }
    this.winnerId = null;
    this.turnTimer = null;
    this.turnDeadline = null;
    this.notify = null; // set by the server to broadcast state after an autonomous timeout kick
    this.trades = []; // { id, fromId, toId, offerProperties, offerMoney, requestProperties, requestMoney }
    this.auctions = []; // { id, tileId, highestBid, highestBidderId, passedIds }
    this.canRollAgain = true; // false once the current player has used their roll for this turn
    this.consecutiveDoubles = 0; // resets each turn; 3 in a row sends the roller to the Holding Pen
  }

  addPlayer(id, name, token) {
    if (this.players.find((p) => p.id === id)) return;
    const color = PLAYER_COLORS[this.players.length % PLAYER_COLORS.length];
    this.players.push({
      id,
      token,
      name,
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

  start() {
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

  rollDice(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId || player.bankrupt || player.left) return { error: "Not your turn" };
    if (this.pendingAction) return { error: "Resolve the current action first" };
    if (!this.canRollAgain) return { error: "You already rolled this turn" };

    const wasInHolding = player.inHolding;
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.lastRoll = [d1, d2];
    const rolledDoubles = d1 === d2;

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
        this.endTurn();
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
    let next = (prev + steps) % TOTAL_TILES;
    if (next < 0) next += TOTAL_TILES;
    if (steps > 0 && next < prev) {
      player.balance += 200;
      this.pushLog(`${player.name} passed Start Plaza and collected 200 coins.`);
    }
    player.position = next;
    this.resolveTile(player);
  }

  resolveTile(player) {
    const tile = BOARD[player.position];
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
            this.pushLog(`${player.name} landed on ${tile.name}, but it's mortgaged -- no rent owed.`);
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
      case TILE_TYPES.HOLDING:
      default:
        break;
    }
    this.checkBankruptcy(player);
  }

  calcRent(tile, owned) {
    if (tile.type === TILE_TYPES.PROPERTY) {
      const houses = owned.houses || 0;
      const groupTiles = propertiesByGroup(tile.group);
      const ownsAll = groupTiles.every((t) => this.ownership[t.id]?.ownerId === owned.ownerId);
      let rent = tile.rent[houses];
      if (houses === 0 && ownsAll) rent *= 2;
      return rent;
    }
    if (tile.type === TILE_TYPES.TRANSIT) {
      const owner = owned.ownerId;
      const count = BOARD.filter((t) => t.type === TILE_TYPES.TRANSIT && this.ownership[t.id]?.ownerId === owner).length;
      return tile.rent[Math.min(count - 1, tile.rent.length - 1)];
    }
    if (tile.type === TILE_TYPES.UTILITY) {
      const owner = owned.ownerId;
      const count = BOARD.filter((t) => t.type === TILE_TYPES.UTILITY && this.ownership[t.id]?.ownerId === owner).length;
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
        player.position = effect.tile;
        if (effect.collectStart) player.balance += 200;
        this.resolveTile(player);
        break;
      case "move":
        this.movePlayer(player, effect.steps);
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
    player.position = 10; // Holding Pen tile index
    player.inHolding = true;
    player.holdingTurns = 0;
    this.pushLog(`${player.name} was sent to the Holding Pen.`);
  }

  buyProperty(playerId) {
    if (!this.pendingAction || this.pendingAction.type !== "awaitBuy" || this.pendingAction.playerId !== playerId) {
      return { error: "No property to buy" };
    }
    const player = this.playerById(playerId);
    const tile = BOARD[this.pendingAction.tileId];
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
    this.pushLog(`${this.playerById(playerId).name} declined to buy ${BOARD[tileId].name}.`);
    this.pendingAction = null;
    this.startAuction(tileId);
    return { ok: true };
  }

  // Opens bidding to every active player (including whoever just declined). Several
  // auctions can be open at once -- e.g. a turn-timeout kick can hand the turn to a new
  // player who immediately lands on a different unowned tile before the first auction
  // closes -- so each gets its own independent id rather than sharing one slot.
  startAuction(tileId) {
    const auction = { id: nanoid(), tileId, highestBid: 0, highestBidderId: null, passedIds: [] };
    this.auctions.push(auction);
    this.pendingAction = { type: "auction", tileId, auctionId: auction.id, playerId: this.currentPlayer()?.id };
    this.pushLog(`${BOARD[tileId].name} is up for auction!`);
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
    this.pushLog(`${player.name} bid ${amount} coins on ${BOARD[auction.tileId].name}.`);
    this.maybeResolveAuction(auction.id);
    return { ok: true };
  }

  passAuction(playerId, auctionId) {
    const auction = this.auctions.find((a) => a.id === auctionId);
    if (!auction) return { error: "Auction not found" };
    if (!auction.passedIds.includes(playerId)) {
      auction.passedIds.push(playerId);
      this.pushLog(`${this.playerById(playerId)?.name ?? "A player"} passed on ${BOARD[auction.tileId].name}.`);
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
    this.auctions = this.auctions.filter((a) => a.id !== auctionId);
    const tile = BOARD[auction.tileId];
    if (auction.highestBidderId) {
      const winner = this.playerById(auction.highestBidderId);
      winner.balance -= auction.highestBid;
      winner.properties.push(auction.tileId);
      this.ownership[auction.tileId] = { ownerId: auction.highestBidderId, houses: 0 };
      this.pushLog(`${winner.name} won the auction for ${tile.name} at ${auction.highestBid} coins.`);
      this.checkBankruptcy(winner);
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
        this.pushLog(`A voided bid reopened the auction for ${BOARD[auction.tileId].name}.`);
      }
      if (!auction.passedIds.includes(playerId)) auction.passedIds.push(playerId);
      this.maybeResolveAuction(auction.id);
    }
  }

  buyHouse(playerId, tileId) {
    const tile = BOARD[tileId];
    const owned = this.ownership[tileId];
    if (!owned || owned.ownerId !== playerId || tile.type !== TILE_TYPES.PROPERTY) {
      return { error: "You do not own this property" };
    }
    if (owned.mortgaged) return { error: "You can't build on a mortgaged property" };
    const groupTiles = propertiesByGroup(tile.group);
    const ownsAll = groupTiles.every((t) => this.ownership[t.id]?.ownerId === playerId);
    if (!ownsAll) return { error: "You must own the full color group" };
    if (owned.houses >= 5) return { error: "Already at max (hotel)" };
    const player = this.playerById(playerId);
    if (player.balance < tile.housePrice) return { error: "Not enough coins" };
    player.balance -= tile.housePrice;
    owned.houses += 1;
    this.pushLog(`${player.name} built on ${tile.name} (level ${owned.houses}).`);
    return { ok: true };
  }

  sellHouse(playerId, tileId) {
    const tile = BOARD[tileId];
    const owned = this.ownership[tileId];
    if (!owned || owned.ownerId !== playerId || tile.type !== TILE_TYPES.PROPERTY) {
      return { error: "You do not own this property" };
    }
    if (!owned.houses) return { error: "There's nothing built here to sell" };
    const player = this.playerById(playerId);
    const refund = Math.floor(tile.housePrice / 2);
    owned.houses -= 1;
    player.balance += refund;
    this.pushLog(`${player.name} sold a house on ${tile.name} for ${refund} coins (now level ${owned.houses}).`);
    return { ok: true };
  }

  mortgageProperty(playerId, tileId) {
    const tile = BOARD[tileId];
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
    const tile = BOARD[tileId];
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
    const tile = BOARD[tileId];
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
    const tile = BOARD[tileId];
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
    if (fromPlayer.balance < trade.offerMoney || toPlayer.balance < trade.requestMoney) {
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
    this.checkBankruptcy(fromPlayer);
    this.checkBankruptcy(toPlayer);
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
      auctions: this.auctions,
      canRollAgain: this.canRollAgain,
      board: BOARD,
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
      auctions: this.auctions,
      canRollAgain: this.canRollAgain,
      consecutiveDoubles: this.consecutiveDoubles,
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
    room.auctions = snapshot.auctions || [];
    room.canRollAgain = snapshot.canRollAgain ?? true;
    room.consecutiveDoubles = snapshot.consecutiveDoubles || 0;

    for (const player of room.players) {
      if (!player.connected && !player.left && !player.bankrupt) {
        room.kickPlayer(player.id, "was disconnected when the server restarted and was removed from the game");
      }
    }
    if (room.started && !room.winnerId) {
      room.startTurnTimer();
    }
    return room;
  }
}

export function generateRoomCode() {
  return nanoid(6).toUpperCase();
}
