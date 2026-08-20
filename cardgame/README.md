# Poopyhead

The classic shedding card game (a "Shithead/Palace"-family house variant) for
2-8 players, each on their own device, connected directly to each other
(WebRTC peer-to-peer) — no game server, no account. Played with standard
French decks: **one deck under 5 players, two decks at 5 or more**, each deck
52 cards plus 2 jokers. Vanilla HTML/CSS/JS, no build step:

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

0. Everyone types their name on the starter page first — it's remembered on
   that device for next time.
1. The host taps **Host Game**, then **Invite Player** once per other
   player joining (up to 7). Each invite generates its own connection code —
   copy it and send it to that specific player (text, chat, read it aloud).
2. Each other player taps **Join Game**, pastes the code sent to *them*, and
   taps **Generate Join Code**. That produces a reply code they send back to
   the host.
3. The host pastes each reply code into that player's slot and taps
   **Connect**. Once a slot shows "Connected," that player is in.
4. With at least 2 players total, the host taps **Start Game**. The app
   deals automatically (the app is the dealer — no shuffling duty rotates).

This uses a public STUN server to help devices find each other's address, but
there's no TURN relay — on most home/mobile networks a direct connection
opens fine, but very restrictive (symmetric) NATs may fail to connect. That's
the accepted tradeoff of a fully serverless design.

## The rules

**Goal: don't be the last player holding cards. The last one left is the
Poopyhead. 💩** Everyone else finishes safe; there's no "winner," only a loser.

### The deal

Each player gets, in dealer order:
- **3 face-down cards** on the table (nobody may look at them, owner included),
- **3 face-up cards** on top of them (everyone can see these),
- **3 cards in hand** (private).

The rest of the cards form the draw deck.

### The hand rule

Your hand must always contain **3 different ranks**. Whenever it holds 2 or
fewer different ranks (and the draw deck isn't empty), you draw until it has
3 different ranks again — so 2♠ 2♦ 5♥ forces a draw, but 2♠ 2♦ 5♥ 5♣ 9♦ is
fine (three different ranks, duplicates allowed). Checked after the deal and
after every play.

### Playing

Like Uno, but by value, not color: you must play a card **equal to or higher**
than the pile's current value (poker order: 2 low … 10, J, Q, K, A high).
All copies of one rank in your hand can be played together in a single turn.
If you have no legal play, you **pick up the whole pile** into your hand and
your turn ends.

### Special cards

| Card | Power |
|------|-------|
| **2** | Plays on anything; resets the pile — next player may play any card. |
| **4** | Skips the next player. (No placement power — like any normal card it only goes on 4 or lower. Each 4 played together skips one player.) |
| **7** | Mirror: plays on anything, and the pile keeps the value of whatever is under it (a 7 on a King still counts as a King). |
| **10** | Plays on anything and **burns** the whole pile out of the game. |
| **J** | Lock: while a Jack tops the pile, the next play must be **lower** than a Jack — or another Jack. (The Jack itself can't be played on Q/K/A.) |
| **Joker** | Wild: plays on anything and becomes **any rank you choose**, with that rank's powers (choose 10 and it burns, choose 4 and it skips…). |

**Burning:** 4 cards of the same rank in a row on the pile — played by one
player or accumulated across turns — burns the pile out of the game, same as
a 10. After any burn the turn passes on normally.

### Running out of cards

While the draw deck lasts, the hand rule keeps refilling you. Once the deck
is empty and your hand runs dry, you play your **face-up table cards, one per
turn**. After those, your **face-down cards, one per turn — blind**: you flip
one and it plays if it beats the pile; if it doesn't, you pick it up together
with the whole pile and are back to playing from hand. Shed everything and
you're **safe**. Last player still holding cards is the **Poopyhead**.

### Choices made where the description left room (same spirit as before —
documented, easily changed)

- Poker order confirmed: A is the highest normal card; jokers are 2 per deck.
- After a burn the turn passes to the next player (chosen over
  "burner goes again").
- A blind face-down card that fails goes to your hand along with the pile.
- A Joker carries the full powers of whatever rank it becomes.
- Several 4s played together skip that many players.
- A pile consisting only of 7s counts as a 7.
- Four-of-a-kind burn counting: a Joker counts as its chosen rank; a 7 counts
  as a 7 (it mirrors for height, but it's still physically a 7).

## Architecture

- The **Host** runs the only copy of the game engine (`src/engine.js`) —
  genuinely authoritative. Every other player's client sends intents
  (`playCards`, `playBlindIndex`, `pickUp`, `chooseJokerRank`) over its own
  WebRTC DataChannel and renders whatever redacted snapshot the host sends
  back, so no player's view can desync and no client is ever sent a hidden
  card's identity.
- **Redaction** (`redactStateFor`): hands are private to their owner;
  **face-down table cards are hidden from everyone, including their owner**
  (they're played blind — clients flip them by position, not identity);
  face-up cards, the pile, and all counts are public.
- **Star topology**: the host holds up to 7 independent `RTCPeerConnection`s
  ("seats" in `src/main.js`); players never connect to each other. Signaling
  is the one-time manual code exchange in `src/net.js` — unchanged since the
  first version of this project, it's fully game-agnostic.
- `src/data.js` builds the decks and defines `canPlayRank` — the single
  legality rule shared by the engine (validation) and the UI (highlighting
  playable cards) so the special-card rules exist exactly once.
- The engine's shuffle uses a seeded RNG, so a match is reproducible from its
  seed for debugging.

## What's intentionally out of scope for this pass

- Reconnecting after a dropped connection mid-match, or auto-skipping a
  disconnected player's turn — if someone drops, the game stalls on their turn.
- A TURN relay fallback for NATs that block a direct connection.
- Late joins after the host has started, and rematch/dealer-rotation flow
  (the description rotates the human dealer to the Poopyhead; here the app
  deals, so start a fresh game from the menu instead).
