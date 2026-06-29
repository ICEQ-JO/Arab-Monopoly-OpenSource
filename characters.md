# Playable Characters — Design Spec

**Status: locked design, not yet implemented.** This is the finalized
ability spec for the 6-character system, worked out in conversation before
any code was written. When implementation starts, this is the source of
truth for what each character is supposed to do — update it in place if a
number or rule changes during implementation, the same way
[systemDesign.md](systemDesign.md) tracks the current architecture.

Real names and portraits are decided separately (codenames here are
placeholders for the ability design itself). Selection mechanics (lobby
flow, uniqueness enforcement, `selectCharacter` event) and the
images-are-just-static-assets approach are settled but not detailed here —
see the chat history this doc was extracted from, or re-derive from
`systemDesign.md`'s existing patterns (`board.js`/`cards.js` as the model
for a future `characters.js`) when implementation starts.

---

## D — The Toll Keeper

**Passive, always on, no cost or limit.**

- Claims a fixed zone of the board (a set group of tiles, exact tiles TBD
  at implementation time — e.g. one quadrant).
- Anyone who lands on a tile inside D's zone pays D a toll of
  **50 + 20 × (houses currently built on that tile)** — so an empty lot
  costs 50, a tile with a hotel (level 5) costs 150.
- This toll is paid **in addition to** any rent owed to the tile's actual
  owner, if it has one. D doesn't need to own anything in their own zone
  to profit from it.
- D also takes **50% of every tax payment** any other player makes,
  anywhere on the board, not just inside D's zone. This comes out of the
  bank — it does **not** add anything to what the taxed player owes.

**Known interaction:** D and Z (below) both feed off tax payments. In a
tax-heavy stretch of a game with both in play, up to 55% of a tax payment
(D's 50% + Z's 5%) goes to two players who didn't pay it. Confirmed
acceptable, not a bug to fix later.

## Z — The Skimmer

**Passive, always on, no cost or limit. Purely reactive — earns nothing if the table doesn't trade or get taxed.**

- Takes **5% of the total value of every completed trade** — cash on both
  sides plus the listed board `price` of any properties changing hands,
  not just the coins involved.
- Takes **5% of every tax payment** any player makes.
- Both percentages are pulled from the bank, same as D's tax cut — never
  an extra charge on the player actually paying.

## Y — The Seizer

**Active, rechargeable, no fixed use cap (limited by cooldown instead).**

- One use **wipes an entire building down to bare land in a single
  action** — it's not one house level at a time; a full hotel (level 5)
  goes to zero in one use, same as a single house would.
- The owner gets the normal per-level refund for every level removed
  (same payout as a voluntary sell-house action would give).
- If the targeted property has **no** houses to remove, the action
  instead forces that property straight into mortgage — the owner still
  gets the normal mortgage payout, just involuntarily.
- **Recharge formula:** cooldown = **2 + 1 turn per house level just
  removed**, counted in Y's own elapsed turns (consistent with how the
  existing Holding Pen's `holdingTurns` only increments on that player's
  own turn, not every turn at the table).
  - Knock down 1 house level → 3-turn cooldown.
  - Wipe a full hotel (5 levels) → 7-turn cooldown.
  - Force-mortgage an empty lot (0 levels removed) → minimum cooldown,
    same as the 1-level case: 3 turns.

## H — The Expander

**Active, hard-capped at 2 uses for the entire game. No recharge — once both uses are spent, that's it.**

- Each use claims the nearest *ownable* tile adjacent to territory H
  already holds, in either direction along the board loop (skipping over
  any tax/card/rest tiles that aren't ownable in between).
- If that nearest tile is unowned, H simply buys it outright.
- If it's owned by someone else, H forces the trade through anyway — but
  always pays full listed price for it. Never a free seizure.

## SD — The Conductor

**Passive (station toll) + Active (attack power, rechargeable on the same timer shape as Y's).**

- Whenever **any** player pays rent on **any** transit station, SD skims
  an extra cut on top, regardless of who owns that station.
- If SD personally owns a station, their own rent collected from it is
  **×1.5** (not the usual count-based scaling other owners get, and not a
  full double).
- Separately, SD has a limited/rechargeable power that can demolish a
  house level or force a mortgage — but always targeting **whoever
  currently owns the most developed properties on the board** (a "check
  the leader" mechanic), not a fixed rival character. This stays
  meaningful even in games where any particular other character isn't
  picked.

## SE — The Opportunist

**Passive (bank bonus) + a single irrevocable choice (alliance).**

- Whenever SE collects money from the bank — passing Start, or a card's
  "collect" effect — they receive a flat bonus on top of the normal
  amount (exact bonus amount TBD at implementation time).
- Once per game, SE may forge a permanent alliance with **either Y or
  SD** (never both, and the choice can never be changed once made).
- While allied, that ally **cannot use their attack power against SE** —
  Y can't seize/demolish SE's property, or SD can't target SE even if SE
  becomes the development leader.

---

## Open implementation questions (intentionally left as placeholders)

- D's exact zone tiles (which quadrant/group).
- SE's exact bank-collection bonus amount.
- Whether Y's/SD's recharge cooldowns should survive a server restart
  exactly, or reset like the turn timer and auction timer currently do
  (see `systemDesign.md` §6 for the precedent — turn/auction timers
  already reset to a fresh full duration on restart, recharge cooldowns
  would likely follow the same simplification).
