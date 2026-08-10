# Rift Clash

A free-for-all card duel for 2-8 players, each on their own device, connected
directly to each other (WebRTC peer-to-peer) — no game server, no account.
Vanilla HTML/CSS/JS, no build step:

```bash
cd cardgame
python3 -m http.server 8081
# open http://localhost:8081 on every device
```

(Dragon Bell, the other game in this repo, uses port 8080 — 8081 avoids a clash.)

## How to connect up to 8 devices

There's no server relaying moves. One player is the **Host**; everyone else
**Join**s by connecting directly to the host (a star topology — players don't
connect to each other, only to the host). Each connection is its own one-time
manual code exchange:

1. The host taps **Host Game**, then **Invite Player** once per other
   player joining (up to 7). Each invite generates its own connection code —
   copy it and send it to that specific player (text, chat, read it aloud).
2. Each other player taps **Join Game**, pastes the code sent to *them*, and
   taps **Generate Join Code**. That produces a reply code they send back to
   the host.
3. The host pastes each reply code into that player's slot and taps
   **Connect**. Once a slot shows "Connected," that player is in.
4. Once at least one other player is connected (2 players minimum, 8 max),
   the host taps **Start Game** and the match begins for everyone currently
   connected — anyone still mid-handshake at that point is left behind.

This uses a public STUN server to help devices find each other's address, but
there's no TURN relay — on most home/mobile networks a direct connection
opens fine, but very restrictive (symmetric) NATs, like some corporate
networks, may fail to connect. That's the accepted tradeoff of a fully
serverless design.

## Rules

- Preset 30-card deck (same list for everyone — no deckbuilding in this
  version). 20 life each. Everyone draws a 4-card opening hand.
- Turn order is fixed at kickoff (host first, then each invited player in the
  order they were invited) and cycles around the table, skipping anyone
  already eliminated.
- Turn: untap → draw a card → play cards / attack (any order, targeting
  whichever opponent you like) → end turn.
- Mana starts at 1 on your own first turn, +1 each of your own turns after
  that, capped at 10, fully refills every turn.
- Creatures have an attack/health stat, can hold up to 5 per player's board,
  and can't attack the turn they're played ("summoning sickness"). Attacking
  targets one specific opponent you choose — either hits their life directly
  or trades with one of their creatures, damage going both ways.
- Spells resolve immediately and go to the discard pile. Some need a target
  (a creature, one of your own creatures, or an opponent to hit directly);
  a few (like Frost Nova) just hit everyone who isn't you, no target needed.
- Draw a card with an empty deck: your discard pile reshuffles into your deck
  automatically. If both are empty, you're eliminated.
- A player is eliminated the moment their life hits 0 (their board is
  discarded and they're skipped for the rest of the game, but stay visible as
  a spectator). Last player standing wins; if the last two somehow drop out
  on the same action, it's a draw.

## Architecture

- The **Host** runs the only copy of the game engine (`src/engine.js`) —
  genuinely authoritative, not just "trusted more." Every other player's
  client only ever sends intents (`playCard`, `attack`, `endTurn`) over their
  own WebRTC DataChannel to the host and renders whatever state snapshot the
  host sends back. Nobody but the host runs the simulation, so no player's
  board can ever desync from anyone else's.
- **Star topology**: the host holds up to 7 independent `RTCPeerConnection`s
  (one per other player, "seats" in `src/main.js`), each with its own
  DataChannel. Players never connect to each other directly. `src/net.js` is
  fully generic per-connection and needed no changes to support this — it was
  already just "one connection, uses it"; `main.js` is what manages an array
  of them instead of a single one.
- Each snapshot is redacted per recipient (`redactStateFor` in
  `src/engine.js`): a player only ever receives their own hand's card
  identities — every other hand arrives as face-down placeholders, never the
  actual cards. This generalizes the same way for 2 players or 8: everyone
  else's hand is always hidden, not just "the opponent's."
- `src/data.js` defines every card as data (id/cost/stats/effects)
  interpreted by one resolver in the engine, not bespoke code per card, plus
  `targetKindFor()` — shared by the engine (to validate a play) and the UI
  (to prompt for the right kind of target: an ally creature, any creature, or
  an opponent to pick).

## What's intentionally out of scope for this pass

- Deckbuilding/collection — everyone always plays the same fixed 30-card list.
- Reconnecting after a dropped connection mid-match, or auto-skipping a
  disconnected player's turn — if someone drops, the game stalls on their
  turn.
- A TURN relay fallback for NATs that block a direct connection.
- Late joins after the host has started the match.
