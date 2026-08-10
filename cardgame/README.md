# Rift Clash

A 1v1 card duel you play across two devices, connected directly to each other
(WebRTC peer-to-peer) — no game server, no account. Vanilla HTML/CSS/JS, no
build step:

```bash
cd cardgame
python3 -m http.server 8081
# open http://localhost:8081 on both devices
```

(Dragon Bell, the other game in this repo, uses port 8080 — 8081 avoids a clash.)

## How to connect two devices

There's no server relaying moves, so the two devices have to trade a couple of
short text codes once, up front, to open a direct connection:

1. One player taps **Host Game**. A connection code appears — copy it and
   send it to the other player any way you like (text, chat, read it aloud).
2. The other player taps **Join Game**, pastes that code in, and taps
   **Generate Join Code**. A second code appears — send that one back to the
   host.
3. The host pastes the reply code in and taps **Connect**. Once the two
   devices find each other, the match starts automatically.

This uses a public STUN server to help the two devices find each other's
address, but there's no TURN relay — on most home/mobile networks the direct
connection opens fine, but very restrictive (symmetric) NATs, like some
corporate networks, may fail to connect. That's the accepted tradeoff of a
fully serverless design.

## Rules

- Preset 30-card deck (same list for both players — no deckbuilding in this
  version). 20 life each.
- Turn: untap → draw a card → play cards / attack (any order) → end turn.
  The player going first draws a 3-card opening hand; the second player draws
  4, to offset the tempo of going first.
- Mana starts at 1, +1 each of your own turns, capped at 10, fully refills
  every turn.
- Creatures have an attack/health stat, can hold up to 5 on your board, and
  can't attack the turn they're played ("summoning sickness"). Attacking
  either hits the opponent directly or trades with one of their creatures —
  damage goes both ways.
- Spells resolve immediately and go to the discard pile.
- Draw a card with an empty deck: your discard pile reshuffles into your deck
  automatically. If both are empty, you lose (deck-out).
- Win by reducing your opponent to 0 life.

## Architecture

- One player (whoever clicks **Host Game**) runs the only copy of the game
  engine (`src/engine.js`) — genuinely authoritative, not just "trusted more."
  The other player's client only ever sends intents (`playCard`, `attack`,
  `endTurn`) over the WebRTC DataChannel and renders whatever state snapshot
  the host sends back. Neither side runs its own simulation, so the two
  boards structurally cannot desync.
- Each snapshot is redacted per recipient (`redactStateFor` in
  `src/engine.js`): a player only ever receives their own hand's card
  identities — the opponent's hand arrives as face-down placeholders, never
  the actual cards.
- `src/net.js` handles the WebRTC connection and the one-time manual SDP
  exchange (see "How to connect two devices" above); `src/data.js` defines
  every card as data (id/cost/stats/effects) interpreted by one resolver in
  the engine, not bespoke code per card; `src/main.js` is the UI layer, screen
  by screen, in the same plain-DOM-template style as `game/src/main.js`.

## What's intentionally out of scope for this pass

- Deckbuilding/collection — both players always play the same fixed 30-card
  list.
- Reconnecting after a dropped connection mid-match.
- A TURN relay fallback for NATs that block a direct connection.
