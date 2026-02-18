# NARUTO MYTHOS TCG - CLAUDE.md

## Project Mission

Build a fully-featured digital implementation of the **Naruto Mythos Trading Card Game** as a web application. The game must be playable against AI opponents (multiple difficulty levels) and against human players online (with rooms/lobbies and an ELO rating system). The application must be immersive, animated, and faithful to the physical game rules — **rule fidelity is the absolute top priority**.

---

## Technology Stack

- **Framework**: Next.js (App Router, already initialized)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: MongoDB via **Prisma** (use Prisma MongoDB connector)
- **Real-time**: Socket.io or Pusher for online multiplayer
- **Animation**: Framer Motion (primary), CSS animations
- **State management**: Zustand or React Context
- **Internationalization**: next-intl (English + French)
- **Auth**: NextAuth.js (credentials + optional OAuth)

### Strict styling rules
- No emojis anywhere in the UI
- No Lucide React or any icon library
- No CSS gradients
- Colors come exclusively from the card images and a dark neutral background palette
- The visual reference is **Pokemon TCG Pocket** — cinematic, immersive, cards visually move and land on the board

---

## Project Structure

```
naruto-mythos-game/
├── output/
│   ├── data/
│   │   ├── naruto_mythos_tcg_complete.json   # All 186 cards
│   │   ├── cards_with_visuals.json           # 66 cards with images
│   │   ├── characters.json
│   │   ├── missions.json                     # 10 mission cards
│   │   └── scrape_summary.json
│   └── images/
│       ├── common/     (48 images, .webp)
│       ├── uncommon/   (1 image)
│       ├── rare/       (2 images)
│       ├── rare_art/   (2 images)
│       ├── secret/     (4 images)
│       ├── mythos/     (2 images)
│       └── mission/    (9 images)
```

Copy all images from `output/images/` into `public/images/` to serve them statically. Card images are referenced by the `image_file` field in the JSON (e.g., `images/common/001-130_HIRUZEN_SARUTOBI.webp` → `/images/common/001-130_HIRUZEN_SARUTOBI.webp`).

---

## The Game Rules (ABSOLUTE PRIORITY — implement to the letter)

### Overview

- 2 players, 4 turns total
- Players are Kage sending ninja on missions
- At the end of turn 4, the player with the most mission points wins
- Each turn, a new mission card is added to the board (1 mission turn 1, 2 missions turn 2, etc.)

---

### Card Types

#### Character Cards

| Field | Description |
|---|---|
| Name | Character name — only 1 character with the same name per player per mission |
| Title | Distinguishes versions of the same character |
| Chakra cost | Chakra required to play the card |
| Power | Strength used to win missions |
| Effects | See effect types below |
| Rarity | C, UC, R, RA, S, M, Legendary |
| Type/Keyword | e.g., Team 7, Sannin, Summon, Rogue Ninja |
| Group | e.g., Leaf Village, Sand Village, Sound Village, Akatsuki, Independent |

#### Mission Cards

- Provide base mission points to the winner
- Rank determined by the turn they enter play: D (+1pt), C (+2pt), B (+3pt), A (+4pt)
- Total points = base points printed on card + rank bonus
- Have SCORE effects that trigger when the mission is won

---

### Effect Types

| Type | Trigger |
|---|---|
| **MAIN** | Triggers when the character is played face-visible (including when revealed from hidden). Applied top-to-bottom. |
| **UPGRADE** | Triggers when the character is played as an upgrade over another character of the same name with a lower chakra cost. |
| **AMBUSH** | Triggers **only** when a hidden character is revealed. Never triggers when played directly face-visible. |
| **SCORE** | Triggers when the player wins the mission where this card is assigned. Requires at least 1 power to win and trigger SCORE. |

**Important effect rules:**
- All effects are optional unless the card text says otherwise (indicated by "you must")
- Effects on existing cards in play trigger before the effects of the newly played card
- When multiple effects trigger simultaneously, the active player chooses the resolution order
- Effects are applied top-to-bottom on a single card
- Some UPGRADE effects modify parts of MAIN effects — always integrate the UPGRADE modification when applying the MAIN effect

**Special effect keywords:**
- `CHAKRA +X` — This character provides X extra chakra during the Start Phase (in addition to the normal +1 per character in play)
- `POWERUP X` — Place X Power tokens on the target character (default target: the card generating the effect)
- `[⧗]` symbol — Indicates a continuous/passive effect (active while the character is face-visible)
- `[↯]` symbol — Indicates a SCORE effect

---

### Deck Construction

- Minimum **30 character cards** in a deck
- May include any number of cards with the same character **name**
- Maximum **2 copies of the same version** of a character (version = card number + edition)
- Rare Art variants of the same card number are NOT considered a different version
- Each player also selects **3 mission cards** (not shuffled into the main deck)

---

### Setup

1. Randomly determine the starting player — they receive the **Edge token**
2. Each player shuffles their 3 mission cards, places them face-down, and randomly selects 2 of them
3. Both players' selected mission cards (4 total) are shuffled together to form the **mission deck**
4. Each player's unused mission card is set aside face-down
5. Each player shuffles their deck and draws **5 cards**
6. Each player may mulligan once: return all 5 cards to the deck, shuffle, draw 5 again (once only)

---

### Turn Structure

Each of the 4 turns follows this sequence:

#### Phase 1: Start Phase
1. Reveal the top card of the mission deck and place it face-up between the players (joining existing missions)
2. Each player gains **5 chakra + 1 chakra per character they control in play** (including hidden characters). Characters with `CHAKRA +X` effects provide additional chakra here.
3. Each player draws **2 cards** from their deck. If the deck is empty, nothing happens (no penalty).

#### Phase 2: Action Phase
1. The player with the Edge token acts first
2. Players alternate taking actions (one action per turn)
3. **Actions available each turn:**
   - Play a character card face-visible on any mission (pay chakra cost, activate MAIN effects)
   - Play a character card face-down (hidden) on any mission (pay exactly **1 chakra**, no effects activate, actual cost is irrelevant)
   - Reveal one of your hidden characters on a mission (pay that card's printed chakra cost, activate its MAIN and AMBUSH effects — this counts as playing a character)
   - **Pass** — you take no more actions this phase
4. **Passing rules:**
   - The first player to pass gains (or keeps) the **Edge token** for the next turn
   - Once a player passes, they cannot act again this phase
   - After one player passes, the other may continue taking multiple actions until they also pass
5. When both players have passed, proceed to Phase 3

#### Phase 3: Mission Phase (Scoring)
Evaluate missions in rank order: **D → C → B → A**

For each mission:
1. Count total power of each player's characters assigned to this mission
   - Include Power token bonuses
   - Hidden characters have 0 power for scoring purposes (they contribute nothing to power comparison while hidden)
   - Continuous `[⧗]` effects apply during scoring
2. The player with more total power **wins** the mission
3. **Ties:** the player with the Edge token wins the tie
4. **Minimum to win:** A player must have at least 1 total power to win a mission. If both players have 0 power, neither wins.
5. The winner gains **mission points** (printed base + rank bonus)
6. The winner activates all **SCORE** effects on the mission card and on their characters assigned to this mission (player chooses order)
7. Proceed to the next mission

#### Phase 4: End Phase
1. Each player discards all remaining chakra from their pool to 0
2. Remove **all Power tokens** from all characters in play
3. If this was turn 4, proceed to **End of Game**
4. Otherwise, begin a new turn (return to Phase 1)

---

### Playing Character Cards

#### Playing Face-Visible
- Pay the printed chakra cost from your pool
- Activate MAIN effects (top to bottom)
- The card is now a visible character assigned to that mission

#### Playing Face-Down (Hidden)
- Pay exactly **1 chakra** (regardless of printed cost)
- The card is placed face-down — it is a **hidden character**
- No effects activate
- **You may look at your own hidden cards at any time**
- Hidden characters have **cost 0 and power 0** when targeted by opponent effects

#### Revealing a Hidden Character
- Pay the card's **printed chakra cost**
- This is treated as **playing a character** — all rules that apply when playing a character apply here
- Activate MAIN and AMBUSH effects
- The character is now face-visible

#### Key Restriction
- A player **cannot have more than one character with the same name** in the same mission at the same time

---

### Character Evolution (Upgrade)

A player may play a character card of the **same name** over an existing character in that mission, **only if the new card has a strictly higher chakra cost**.

**Cost:** Pay only the **difference** in chakra cost (new cost minus old cost)

**Example:** Upgrading from a card with cost 4 to one with cost 5 costs only 1 chakra.

**Rules:**
- Place the new card on top of the old one (the stack is treated as a single character)
- The old card's text is ignored — only the top card's effects apply
- Activate MAIN and UPGRADE effects of the new card
- Power tokens on the old character transfer to the new card
- The character retains its visible/hidden status through evolution
- If a stacked character is defeated, discard the entire stack
- Effects that target "a character" affect the entire stack

---

### The Edge Token

- The player with the Edge token:
  - Plays first in the Action Phase
  - Wins all ties during the Mission Phase
- The **first player to pass** in the Action Phase takes (or retains) the Edge token
- Edge token ownership is relevant for tie-breaking throughout the Mission Phase of the following turn
- At end of game (turn 4), if scores are tied, the Edge token holder wins

---

### Power Tokens

- Represent bonus power beyond a card's printed Power stat
- Added via `POWERUP X` effects (place X tokens on the target character)
- Can be placed on hidden characters (hidden characters then have power equal to their token count, but this only matters when they are revealed)
- Tokens are transferred to the new card when a character is upgraded
- **All Power tokens are removed at the end of each turn (End Phase)**

---

### End of Game

After the End Phase of turn 4:
- Compare total mission points for both players
- Most points wins
- Tie = Edge token holder wins

---

## Card Data

### JSON Structure

All card data is in `output/data/naruto_mythos_tcg_complete.json`. Each card object:

```typescript
interface Card {
  id: string;              // e.g. "001/130", "MSS 01", "108/130 A"
  number: number;
  name_fr: string;         // Character name (French, use as canonical name)
  title_fr: string;        // Card title (French)
  rarity: "C" | "UC" | "R" | "RA" | "S" | "M" | "Legendary" | "Mission";
  card_type: "character" | "mission";
  has_visual: boolean;
  chakra?: number;         // Chakra cost (character cards only)
  power?: number;          // Base power (character cards only)
  keywords?: string[];     // e.g. ["Team 7", "Sannin", "Summon"]
  group?: string;          // e.g. "Leaf Village", "Sand Village"
  effects?: Array<{
    type: "MAIN" | "UPGRADE" | "AMBUSH" | "SCORE";
    description: string;
  }>;
  image_url?: string;
  rarity_display?: string;
  image_file?: string;     // e.g. "images\\common\\001-130_HIRUZEN_SARUTOBI.webp"
  is_rare_art?: boolean;
}
```

### Cards Available for Play (have `has_visual: true`)

**Only cards with images should be playable in deck-building and gameplay.** Cards without images (`has_visual: false`) should appear in the collection viewer as silhouettes but cannot be added to a deck.

### Effect Text Parsing

Effect descriptions use markup that must be parsed:
- `[u]Character Name[/u]` → reference to a specific character name (bold/underline in UI)
- `[⧗]` → continuous/passive effect indicator
- `[↯]` → SCORE effect indicator
- `POWERUP X` → add X power tokens
- `CHAKRA +X` → +X chakra during Start Phase
- `"effect:"` prefix on a second MAIN → this MAIN modifies the preceding MAIN (UPGRADE can also modify MAIN — read carefully)

### Implementing Each Card's Logic

**Every card effect must be individually coded and respected exactly.** Do not approximate. Read each card's effect description, understand what it does mechanically, and implement it precisely. Examples:

- **Akamaru (027)**: Continuous — if no friendly Kiba Inuzuka in the same mission at end of round, return to hand
- **Kiba Inuzuka (025)**: Continuous — if Akamaru is in same mission, CHAKRA +1 during Start Phase
- **Orochimaru (050)**: AMBUSH — look at a hidden enemy character in this mission; if it costs 3 or less, take control and move it to your side
- **Hayate Gekko (048)**: Continuous — if this character would be defeated, hide it instead
- **Gemma Shiranui (049)**: Continuous — if a friendly Leaf Village character in this mission would be hidden or defeated by enemy effects, you may defeat this character instead (sacrifice mechanic)
- **Gaara (120/R)**: MAIN — defeat up to 1 enemy character with Power 1 or less in every mission; UPGRADE — POWERUP X where X is the number of characters defeated by this MAIN effect
- **Naruto (133/S)**: MAIN — hide an enemy character with Power 5 or less in this mission AND another enemy character with Power 2 or less in play; the MAIN "effect:" modifier upgrades this to defeat both instead of hiding them (this modifier applies when this card upgrades a previous Naruto)
- **Kisame (144/M)**: MAIN — steal 1 chakra from opponent's pool
- **Itachi (143/M)**: MAIN — move a friendly character to this mission; AMBUSH — move an enemy character to this mission

For every card, read the description carefully and implement a dedicated handler.

---

## Database Schema (Prisma + MongoDB)

```prisma
model User {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  username      String   @unique
  email         String   @unique
  password      String
  elo           Int      @default(1000)
  wins          Int      @default(0)
  losses        Int      @default(0)
  draws         Int      @default(0)
  createdAt     DateTime @default(now())
  decks         Deck[]
  gamesAsPlayer1 Game[]  @relation("Player1")
  gamesAsPlayer2 Game[]  @relation("Player2")
}

model Deck {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  name       String
  userId     String   @db.ObjectId
  user       User     @relation(fields: [userId], references: [id])
  cardIds    String[] // Array of card IDs from the JSON
  missionIds String[] // Array of 3 mission card IDs
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Game {
  id           String     @id @default(auto()) @map("_id") @db.ObjectId
  player1Id    String?    @db.ObjectId
  player2Id    String?    @db.ObjectId
  player1      User?      @relation("Player1", fields: [player1Id], references: [id])
  player2      User?      @relation("Player2", fields: [player2Id], references: [id])
  isAiGame     Boolean    @default(false)
  aiDifficulty String?    // "easy" | "medium" | "hard" | "expert"
  status       String     // "waiting" | "in_progress" | "completed"
  winnerId     String?    @db.ObjectId
  gameState    Json?      // Full serialized game state
  player1Score Int        @default(0)
  player2Score Int        @default(0)
  eloChange    Int?       // ELO delta applied after game
  createdAt    DateTime   @default(now())
  completedAt  DateTime?
}

model Room {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  code       String   @unique // 6-char join code
  hostId     String   @db.ObjectId
  guestId    String?  @db.ObjectId
  gameId     String?  @db.ObjectId
  status     String   // "waiting" | "in_progress" | "completed"
  isPrivate  Boolean  @default(false)
  createdAt  DateTime @default(now())
}
```

---

## AI Opponent

Implement AI at multiple difficulty levels. The AI plays a full legal game respecting all rules.

### Difficulty Levels

| Level | Description |
|---|---|
| **Easy** | Random legal actions, no strategic evaluation |
| **Medium** | Greedy strategy — always plays the highest-power card it can afford on the highest-value mission |
| **Hard** | Minimax-style evaluation — considers opponent's board state, manages chakra efficiently, uses hidden characters strategically |
| **Expert** | Full expectimax with heuristics — evaluates SCORE effects, plans across multiple turns, models probability of opponent hands |

### AI Heuristic Components (Hard+)
- Mission point value weighting (rank A missions are worth more)
- Power advantage on each mission
- Chakra efficiency (cost vs power ratio)
- Card effect value (SCORE effects, CHAKRA +X, POWERUP chains)
- Hidden character bluffing and reveal timing
- Edge token management

---

## Application Pages

### `/` — Home / Landing
- Game logo, dark immersive background using character art
- Buttons: Play vs AI, Play Online, Collection, Deck Builder, Leaderboard
- Language switcher (EN/FR) in the header

### `/collection` — Card Collection
- Grid of all cards from the JSON
- Cards without images shown as silhouettes
- Filter by: rarity, group, keyword, type
- Click to see full card details

### `/deck-builder` — Deck Builder
- Drag-and-drop interface
- Left panel: all playable cards (has_visual: true) with filters
- Right panel: current deck (character cards + 3 mission cards)
- Live validation: minimum 30 cards, max 2 of each version
- Save/load/delete decks (requires auth)
- Card preview with full art on hover

### `/play/ai` — Play vs AI
- Select difficulty (Easy / Medium / Hard / Expert)
- Select your deck
- Launch game

### `/play/online` — Online Lobby
- Create a private room (generates a 6-character join code)
- Join a room by code
- Public matchmaking (finds a random opponent)
- See your ELO rating and recent matches

### `/game/[id]` — Game Board (the core)
See the Game Board section below.

### `/leaderboard` — ELO Rankings
- Top players ranked by ELO
- Shows username, ELO, W/L/D record

### `/profile/[username]` — Player Profile
- ELO history chart
- Recent games
- Deck collection

---

## Game Board — UI Requirements

The game board is the most critical UI element. It must feel immersive and alive.

### Layout

```
+--------------------------------------------------+
|  OPPONENT HAND (cards face-down, fanned)         |
|  OPPONENT CHAKRA POOL         OPPONENT SCORE     |
|                                                  |
|  [MISSION D]  [MISSION C]  [MISSION B]  [MISSION A]|
|  opp chars    opp chars    opp chars    opp chars |
|  --------------------------------------------    |
|  player chars player chars player chars player chars|
|                                                  |
|  PLAYER CHAKRA POOL            PLAYER SCORE      |
|  PLAYER HAND (cards visible, fanned)             |
+--------------------------------------------------+
```

### Animations (all required)

- **Card deal**: cards fly from deck to hand one by one at game start
- **Card play**: card lifts off hand, glides to mission zone with a slight arc and drop impact
- **Card reveal**: hidden card flips with a 3D card-flip animation (Y-axis rotation)
- **Card upgrade**: new card slides in over old card with a merge animation
- **Card defeat**: card dissolves/burns away with a particle effect
- **Card hide**: card flips back face-down with a flip animation
- **Card move**: card slides from one mission lane to another with motion blur
- **Power token appear**: tokens materialise on the card with a bounce effect
- **Chakra gain**: chakra counter increments with a number scroll animation
- **Mission score**: winning player's cards glow, mission card flips to show points, points fly toward the score counter
- **Edge token**: a visual indicator slides to the winning player when Edge changes hands
- **Turn transition**: smooth animated overlay marking "Turn 2", "Turn 3", etc.
- **Game end**: dramatic win/lose screen with character art

### Card Rendering

Each card must display:
- Full card art (from `/images/...` path) as the card background
- Card name, title (as overlay text on card)
- Chakra cost (top-left badge)
- Power (bottom-right badge, updated live with power tokens)
- Effect text (readable overlay on hover/inspect)
- Rarity indicator
- Power token count (visible as a number or token visual on the card face)

Hidden cards show the card back (a dark textured back with the game logo).

### Game State Panel

A side panel or HUD showing:
- Current turn (1-4) and current phase
- Each player's chakra pool (live updated)
- Mission point totals per player
- Which player holds the Edge token
- Deck size and discard pile size for each player

### Action Feedback

- Highlight valid targets (missions, cards) when it is the player's turn to act
- Show a confirmation dialog before irreversible effects
- Show the opponent's actions with narrated text ("Opponent plays Naruto on Mission C...")
- A game log / event history panel

---

## Game Engine Architecture

### Core State Machine

```typescript
type GamePhase = "start" | "action" | "mission" | "end";

interface GameState {
  turn: 1 | 2 | 3 | 4;
  phase: GamePhase;
  activePlayer: "player1" | "player2";
  edgeHolder: "player1" | "player2";
  player1: PlayerState;
  player2: PlayerState;
  missionDeck: MissionCard[];
  activeMissions: ActiveMission[];  // missions in play, indexed 0-3
  log: GameLogEntry[];
}

interface PlayerState {
  userId: string | null;        // null for AI
  isAI: boolean;
  aiDifficulty?: string;
  deck: Card[];                 // remaining deck
  hand: Card[];
  discardPile: Card[];
  chakra: number;
  missionPoints: number;
  hasPassed: boolean;
}

interface ActiveMission {
  card: MissionCard;
  rank: "D" | "C" | "B" | "A";
  basePoints: number;
  rankBonus: number;
  player1Characters: CharacterInPlay[];
  player2Characters: CharacterInPlay[];
}

interface CharacterInPlay {
  card: CharacterCard;
  isHidden: boolean;
  powerTokens: number;
  stack: CharacterCard[];   // all cards in the evolution stack (bottom to top)
  controlledBy: "player1" | "player2";
  originalOwner: "player1" | "player2";
}
```

### Effect Resolution Engine

Build a central effect resolver that handles:
1. Looking up the card's effects by card ID
2. Resolving the effect type (MAIN, UPGRADE, AMBUSH, SCORE)
3. Validating targets
4. Applying state changes
5. Triggering any chain reactions (effects triggered by the resolution)

Each card must have a dedicated handler function registered in an effect registry:

```typescript
const effectRegistry: Record<string, EffectHandler> = {
  "001/130": handleHiruzanC,    // POWERUP 2 another friendly Leaf Village character
  "003/130": handleTsunadeC,    // On defeat of any friendly, gain 2 chakra
  // ... one entry per card
};
```

---

## Internationalization

Use `next-intl`. Provide translation keys for:
- All UI labels, button text, phase names, game messages
- Card names and titles in both French (fr) and English (en) — use `name_fr`/`title_fr` for French, and derive English names from the existing data where available (the missions JSON has `name_en` fields)
- Effect text should also be bilingual (store translations in locale files)

Language switcher available on all pages. Default language detected from browser.

---

## ELO System

Use the standard ELO formula:
- K-factor: 32 for players below 2000 ELO, 16 above
- Expected score: `E = 1 / (1 + 10^((opponentElo - playerElo) / 400))`
- New ELO: `newElo = oldElo + K * (actualScore - expectedScore)`
- Win = 1.0, Draw = 0.5, Loss = 0.0
- Apply ELO changes only for rated online games (not AI games, not private rooms unless opted-in)
- Minimum ELO: 100 (floor)

---

## Online Multiplayer

- Use WebSockets (Socket.io) for real-time game events
- Game state is authoritative on the server — clients send **actions**, server validates and applies them, then broadcasts updated state
- The server enforces all game rules (never trust client-side rule enforcement alone)
- Private rooms: host creates a room, shares the 6-character code, guest joins
- Public matchmaking: simple queue matching by ELO proximity

### Events

```typescript
// Client -> Server
"action:play-character"     // { cardIndex, missionIndex, hidden: boolean }
"action:reveal-character"   // { missionIndex, characterIndex }
"action:pass"
"room:create"
"room:join"                 // { code }

// Server -> Client
"game:state-update"         // full or partial GameState
"game:action-performed"     // { player, action, description }
"game:your-turn"
"game:ended"                // { winner, scores, eloChanges }
"room:player-joined"
"room:player-left"
```

---

## Implementation Order

1. **Data layer**: seed MongoDB with all card data from the JSON files; set up Prisma schema
2. **Game engine**: pure TypeScript game state machine with full rule implementation and tests
3. **AI opponent**: implement all 4 difficulty levels
4. **Auth**: NextAuth.js with credentials provider
5. **Game board UI**: board layout, card components, animations
6. **Deck builder**: drag-and-drop, validation, persistence
7. **Collection viewer**
8. **Online multiplayer**: Socket.io integration, room system, ELO
9. **Leaderboard and profiles**
10. **i18n**: English/French translations throughout
11. **Polish**: all animations, sound hooks, responsive design

---

## Absolute Constraints

1. **Rules are law**: every single game mechanic from the rulebook must be implemented exactly. Do not approximate, skip, or house-rule anything. When in doubt, re-read the rules section above.
2. **Every card is unique**: implement each card's effect logic individually in the effect registry. Do not group cards with "similar" effects and round off differences.
3. **Images only from `output/images/`**: no external images, no placeholder art for cards that have images. Cards without images get a silhouette treatment.
4. **No icons, no gradients, no emojis**: the aesthetic must be clean, dark, text + image driven.
5. **Animations are mandatory**: the game must feel like a living card game — cards physically move. Use Framer Motion for all card transitions.
6. **Bilingual from the start**: every user-facing string must exist in both EN and FR from the first implementation.
7. **Server-authoritative multiplayer**: the game server enforces rules. Clients are displays.

---

## Key Game Rule Edge Cases to Handle

- A player whose deck is empty simply does not draw when asked to — no penalty
- Hidden characters count toward the +1 chakra per character in play during Start Phase
- Hidden characters have cost 0 and power 0 when targeted by enemy effects
- Power tokens persist through a hidden-to-revealed transition (and vice versa)
- When control of a card changes (e.g., Orochimaru effect), track original owner — if the card must leave play, it returns to its original owner's discard
- A player must have at least 1 total power to win a mission — if a player has 0 power (e.g., all characters are hidden), they cannot win even by default
- Only 1 character with the same **name** per player per mission — this applies to the revealed name; two hidden cards with the same name can coexist in the same mission until one is revealed
- Upgrade cost: if somehow the difference is 0 or negative (same cost), upgrade is not legal — must be strictly higher cost
- The Edge token pass: the first player to **initiate** the pass action (not necessarily the first player who has no more legal moves) receives the Edge token
- Effects that say "if able" mean: if the condition is met and a valid target exists, the effect is mandatory; "you can" means optional

---

## Available Card Images (Playable Cards)

The following cards have images and are playable in decks:

**Common (C)**
- 001 Hiruzen Sarutobi, 003 Tsunade, 007 Jiraiya, 009 Naruto Uzumaki, 011 Sakura Haruno, 013 Sasuke Uchiha, 015 Kakashi Hatake, 019 Ino Yamanaka, 021 Shikamaru Nara, 023 Asuma Sarutobi, 025 Kiba Inuzuka, 027 Akamaru, 034 Yuhi Kurenai, 036 Neji Hyuga, 040 Tenten, 042 Gai Maito, 044 Anko Mitarashi, 046 Ebisu, 047 Iruka, 048 Hayate Gekko, 049 Gemma Shiranui, 050 Orochimaru, 055 Kimimaro, 057 Jirobo, 059 Kidomaru, 061 Sakon, 064 Tayuya, 068 Dosu Kinuta, 070 Zaku Abumi, 072 Kin Tsuchi, 074 Gaara, 075 Gaara, 077 Kankuro, 079 Temari, 081 Baki, 084 Yashamaru, 086 Zabuza Momochi, 088 Haku, 090 Itachi Uchiha, 092 Kisame Hoshigaki, 094 Gama Bunta, 095 Gamahiro, 096 Gamakichi, 097 Gamatatsu, 098 Katsuyu, 099 Pakkun, 100 Ninja Hounds, 101 Ton Ton

**Uncommon (UC)**
- 039 Rock Lee

**Rare (R)**
- 108 Naruto Uzumaki, 120 Gaara

**Rare Art (RA)**
- 108A Naruto Uzumaki, 120A Gaara

**Secret (S)**
- 133 Naruto Uzumaki (Rasengan), 135 Sakura Haruno, 136 Sasuke Uchiha, 137 Kakashi Hatake

**Mythos (M)**
- 143 Itachi Uchiha, 144 Kisame Hoshigaki

**Mission Cards (with images)**
- MSS 01 Call for Support, MSS 02 Chunin Exam, MSS 03 Find the Traitor, MSS 04 Assassination, MSS 05 Bring it Back, MSS 06 Rescue a Friend, MSS 07 I Have to Go, MSS 08 Set a Trap, MSS 10 Chakra Training

---

## Notes for the Developer

- Start by thoroughly reading `output/data/naruto_mythos_tcg_complete.json` to understand all card effects before writing a single line of game logic
- Build the game engine as a pure, framework-agnostic TypeScript module with unit tests — decouple it from React completely
- The visual layer (React + Framer Motion) should consume the game engine via a clean API (actions + state)
- For AI difficulty "Expert", consider using a Monte Carlo simulation or MCTS given the hidden information nature of the game (hidden cards)
- The game has significant hidden information (opponent's hand, hidden characters) — the AI must reason about probabilities, not cheat by reading hidden state
- Prioritize correctness of game rules over performance optimizations in early phases
- All card effect text in the JSON is in English — use it as the source of truth for effect logic
