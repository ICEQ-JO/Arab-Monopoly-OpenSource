# Sounds Added

Sound effects wired up in `client/src/sfx.js` (all served from `client/public/`).
Every one of these is gated by the existing sound on/off toggle (Lobby's mute
button) and plays through the shared `AudioContext`, so it's audible to every
player in the room at the same time -- not just whoever triggered the action.

| File | Plays when | Triggered from |
| --- | --- | --- |
| `whoosh.mp3` | The dice are rolled | `rollSeq` change, watched in `client/src/components/Dice.jsx` |
| `Tradin2.mp3` | A new trade offer is proposed | `state.trades` diff, watched in `client/src/App.jsx` |
| `TradeAccepted.mp3` | A trade is accepted | Game log line ("...completed a trade."), watched in `client/src/App.jsx` |
| `DeclineTrade.mp3` | A trade is declined | Game log line ("...declined ...trade offer."), watched in `client/src/App.jsx` |
| `Bought_tile.mp3` | A property/station is bought | Game log line ("... bought ..."), watched in `client/src/App.jsx` |

Removed: the old synthesized dice-roll "rattle" (`playDiceRoll` in `sfx.js`) --
replaced by `whoosh.mp3`.
