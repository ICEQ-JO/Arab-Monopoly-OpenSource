# Playable Characters — Design Spec

**Status: locked design, not yet implemented.** This is the finalized
ability spec for the 6-character system, worked out in conversation before
any code was written. When implementation starts, this is the source of
truth for what each character is supposed to do — update it in place if a
number or rule changes during implementation, the same way
[systemDesign.md](systemDesign.md) tracks the current architecture.

Theme: crime-boss / heist archetypes. Real portraits are decided separately.
Selection mechanics (lobby flow, uniqueness enforcement, `selectCharacter`
event) and the images-are-just-static-assets approach are settled but not
detailed here — re-derive from `systemDesign.md`'s existing patterns
(`board.js`/`cards.js` as the model for a future `characters.js`) when
implementation starts.

---

## D — The Don

**Passive, always on, no cost or limit.**

- Holds a **30% stake** in a fixed turf zone (a designated group of tiles,
  exact tiles TBD at implementation time). Any rent collected on tiles in
  that zone pays D 30% of the amount on top.
- Takes **50% of every tax payment** any other player makes, anywhere on the
  board, not just inside his turf. Paid from the bank — never an extra
  charge on the taxed player.

**Active — Barricade, rechargeable, 10-turn cooldown.**

- Places a wall on any one tile of his choice.
- For the rest of that round, any player whose movement would otherwise carry
  them past that tile is stopped there instead, and resolves that tile's
  normal action (rent, tax, card draw, etc.) as if they'd landed on it
  exactly — even if their roll would have taken them further.
- The barricade itself doesn't charge a toll; whatever the player owes is
  just whatever that tile would normally charge.

---

## Z — The Enforcer

**Passive, always on, no cost or limit. Purely reactive — earns nothing if
the table doesn't trade or get taxed.**

- Takes **5% of the total value of every completed trade** — cash on both
  sides plus the listed board `price` of any properties changing hands, not
  just the coins involved.
- Takes **5% of every tax payment** any player makes.
- Both percentages are pulled from the bank, same as D's tax cut — never an
  extra charge on the player actually paying.

**Active — Curse, rechargeable, 7-turn cooldown.**

- Targets any player. For the remainder of that round, **100% of whatever
  that player would earn** goes to Z instead — the cursed player gets nothing
  at all from any source until the round ends.
- Drawback: Z cannot pay to leave the holding tile early — must always wait
  out the full sentence.

---

## Y — The Wrecker

**Passive, always on, no cost or limit.**

- Whenever any player demolishes a house/hotel level or mortgages a property,
  Y collects a flat **$50 from the bank**.
- Selling raw, undeveloped land does not trigger this.

**Active — Detonate, rechargeable, cooldown scales with damage done.**

- Destroys a building on a targeted property in a single action.
- Recharge formula, by what was destroyed:
  - Empty lot (no levels removed): 4 turns
  - One house level: 5 turns
  - Two house levels: 6 turns
  - Three house levels: 7 turns
  - Four house levels: 8 turns
  - Hotel (full level 5): 9 turns

---

## H — The Kingpin

**Passive, always on, no cost or limit.**

- Claims a fixed turf zone (separate from D's, exact tiles TBD at
  implementation time).
- Tracks landings on that zone across all players. Every **third landing**
  (a deterministic counter, not a random chance) triggers a **90% cut** of
  that landing's earnings to H.

**Active 1 — Flank Seizure, rechargeable, 12-turn cooldown.**

- Seizes the two ownable tiles immediately flanking a property H already
  owns — the nearest ownable tile to the left and to the right along the
  board loop. If unowned, H buys outright; if owned, H forces the trade
  at full listed price.

**Active 2 — Hostile Takeover, rechargeable, 7-turn static cooldown.**

- Takes control of any one tile for the duration of the current round only,
  then it reverts.

---

## SD — The Conductor

**Passive (station toll), always on, no cost or limit.**

- If SD owns the station a player lands on, that player pays **double** the
  normal rent.
- If SD doesn't own it, the landing player pays a flat **$50 to SD**
  regardless of who the actual owner is, in addition to whatever they owe
  that owner.

**Active — Wrecking Tour, rechargeable, 8-turn cooldown.**

- Sends a bus around the board loop starting from SD's current position,
  demolishing **2 building levels** on every property tile it passes through
  (where applicable), continuing until it reaches tile 6 (the Coster
  Station).

---

## SE — The Fixer

**Passive, always on, no cost or limit.**

- Collects **$400** instead of the normal $200 for passing Start.
- Collects **$800** for landing exactly on Start.
- Any payout from the bank (cards, etc.) is **doubled**.

**Active — Heist, rechargeable, cooldown depends on what's stolen.**

- Steals another player's active ability and uses it once, on the spot, as
  if SE owned it.
- Recharge formula: **5 turns + half of the stolen ability's own static
  cooldown** (rounding TBD — see open questions below).

---

## Open implementation questions (intentionally left as placeholders)

- D's and H's exact turf-zone tiles (which quadrants/groups, and whether
  they're allowed to overlap).
- Whether Active/Active 2 cooldowns should survive a server restart exactly,
  or reset like the turn timer and auction timer currently do (see
  `systemDesign.md` §6 for the precedent — turn/auction timers already reset
  to a fresh full duration on restart, recharge cooldowns would likely follow
  the same simplification).
- Exact rounding rule for SE's "half of the stolen ability's cooldown" when
  that cooldown is odd.
