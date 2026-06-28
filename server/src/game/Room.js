import { nanoid } from "nanoid";
import { BOARD, TILE_TYPES, TOTAL_TILES, propertiesByGroup } from "./board.js";
import { SURPRISE_CARDS, TREASURE_CARDS, shuffledDeck } from "./cards.js";

const STARTING_BALANCE = 1500;
const HOLDING_RELEASE_RENT = 50;
const MAX_HOLDING_TURNS = 3;

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#1abc9c"];

export class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = []; // {id, name, color, balance, position, inHolding, holdingTurns, holdingFreeCard, bankrupt, properties: [tileId]}
    this.ownership = {}; // tileId -> { ownerId, houses }
    this.started = false;
    this.turnIndex = 0;
    this.surpriseDeck = shuffledDeck(SURPRISE_CARDS);
    this.treasureDeck = shuffledDeck(TREASURE_CARDS);
    this.log = [];
    this.lastRoll = null;
    this.pendingAction = null; // { type: 'awaitBuy'|'awaitRent'..., tileId }
    this.winnerId = null;
  }

  addPlayer(id, name) {
    if (this.players.find((p) => p.id === id)) return;
    const color = PLAYER_COLORS[this.players.length % PLAYER_COLORS.length];
    this.players.push({
      id,
      name,
      color,
      balance: STARTING_BALANCE,
      position: 0,
      inHolding: false,
      holdingTurns: 0,
      holdingFreeCard: false,
      bankrupt: false,
      properties: [],
    });
  }

  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
    for (const tileId of Object.keys(this.ownership)) {
      if (this.ownership[tileId].ownerId === id) delete this.ownership[tileId];
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
    this.pushLog("Game started!");
  }

  rollDice(playerId) {
    const player = this.currentPlayer();
    if (!player || player.id !== playerId || player.bankrupt) return { error: "Not your turn" };
    if (this.pendingAction) return { error: "Resolve the current action first" };

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.lastRoll = [d1, d2];

    if (player.inHolding) {
      player.holdingTurns += 1;
      if (d1 === d2) {
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
        this.endTurn();
        return { rolled: [d1, d2], stayedInHolding: true };
      }
    }

    const steps = d1 + d2;
    this.movePlayer(player, steps);

    if (d1 === d2 && !player.inHolding) {
      // doubles grant another roll, handled client-side by not auto-ending turn
    } else {
      this.afterMoveResolved = true;
    }

    return { rolled: [d1, d2], doubles: d1 === d2 };
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
          const rent = this.calcRent(tile, owned);
          this.transferMoney(player.id, owned.ownerId, rent);
          this.pushLog(`${player.name} paid ${rent} rent to ${this.playerById(owned.ownerId).name} for ${tile.name}.`);
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
    this.pushLog(`${this.playerById(playerId).name} declined to buy ${BOARD[this.pendingAction.tileId].name}.`);
    this.pendingAction = null;
    return { ok: true };
  }

  buyHouse(playerId, tileId) {
    const tile = BOARD[tileId];
    const owned = this.ownership[tileId];
    if (!owned || owned.ownerId !== playerId || tile.type !== TILE_TYPES.PROPERTY) {
      return { error: "You do not own this property" };
    }
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

  transferMoney(fromId, toId, amount) {
    const from = this.playerById(fromId);
    const to = this.playerById(toId);
    from.balance -= amount;
    to.balance += amount;
  }

  checkBankruptcy(player) {
    if (player.balance < 0 && !player.bankrupt) {
      player.bankrupt = true;
      for (const tileId of player.properties) {
        delete this.ownership[tileId];
      }
      player.properties = [];
      this.pushLog(`${player.name} went bankrupt!`);
      const remaining = this.players.filter((p) => !p.bankrupt);
      if (remaining.length === 1) {
        this.winnerId = remaining[0].id;
        this.pushLog(`${remaining[0].name} wins the game!`);
      }
    }
  }

  endTurn() {
    this.pendingAction = null;
    const activePlayers = this.players.filter((p) => !p.bankrupt);
    if (activePlayers.length <= 1) return;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
    } while (this.players[this.turnIndex].bankrupt);
    this.lastRoll = null;
    this.lastCard = null;
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
      players: this.players,
      ownership: this.ownership,
      log: this.log.slice(0, 20),
      lastRoll: this.lastRoll,
      lastCard: this.lastCard,
      pendingAction: this.pendingAction,
      winnerId: this.winnerId,
      board: BOARD,
    };
  }
}

export function generateRoomCode() {
  return nanoid(6).toUpperCase();
}
