import { GameEngine } from '../lib/engine/GameEngine';
import type { GameAction, GameConfig, GameState, PlayerID } from '../lib/engine/types';
import { AIPlayer, type AIDifficulty, type AIStrategy } from '../lib/ai/AIPlayer';
import { getAllCards } from '../lib/data/cardLoader';

type AgentMode = 'heuristic' | 'neural';

interface AgentSpec {
  label: 'A' | 'B';
  difficulty: AIDifficulty;
  mode: AgentMode;
}

interface AgentBinding {
  spec: AgentSpec;
  player: PlayerID;
  strategy: AIStrategy;
}

interface MatchResult {
  winner: 'A' | 'B' | 'skipped';
  pointsA: number;
  pointsB: number;
  durationMs: number;
  steps: number;
  usedTiebreak: boolean;
}

const args = parseArgs();
const PROGRESS_EVERY = Math.max(1, Math.min(10, Math.floor(args.games / 10) || 1));
const MAX_STEPS = 1200;
const LIVE_LOG_EVERY_MS = 5000;

function safeNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildRandomDeck(allCards: any[]): { deck: any[]; missions: any[] } {
  const characters = allCards.filter(
    (card) => card.card_type === 'character' && card.has_visual,
  );
  const missions = allCards.filter(
    (card) => card.card_type === 'mission' && card.has_visual,
  );

  if (characters.length < 30) {
    throw new Error(`Not enough character cards (${characters.length} < 30)`);
  }

  const deck: any[] = [];
  const counts = new Map<string, number>();
  const shuffled = [...characters].sort(() => Math.random() - 0.5);

  for (const card of shuffled) {
    if (deck.length >= 30) break;

    const count = counts.get(card.cardId) ?? 0;
    if (count < 2) {
      deck.push(card);
      counts.set(card.cardId, count + 1);
    }
  }

  while (deck.length < 30) {
    const extra = shuffled.find((card) => (counts.get(card.cardId) ?? 0) < 2);
    if (!extra) break;

    deck.push(extra);
    counts.set(extra.cardId, (counts.get(extra.cardId) ?? 0) + 1);
  }

  const missionDeck = [...missions].sort(() => Math.random() - 0.5).slice(0, 3);
  return { deck, missions: missionDeck };
}

function getDecisionPlayer(state: GameState): PlayerID {
  if (state.phase === 'mulligan') {
    return state.player1.hasMulliganed ? 'player2' : 'player1';
  }

  const pendingAction = state.pendingActions[0];
  if (pendingAction) {
    return pendingAction.player;
  }

  const optionalEffect = state.pendingEffects.find(
    (effect) => effect.isOptional && !effect.resolved,
  );
  if (optionalEffect) {
    return optionalEffect.sourcePlayer;
  }

  return state.activePlayer;
}

function tryAutoAdvance(state: GameState, actingPlayer: PlayerID): GameState | null {
  if (
    (state.phase === 'mission' || state.phase === 'end') &&
    state.pendingActions.length === 0 &&
    state.pendingEffects.length === 0
  ) {
    try {
      return GameEngine.applyAction(state, actingPlayer, { type: 'ADVANCE_PHASE' });
    } catch {
      return null;
    }
  }

  return null;
}

function bindAgent(spec: AgentSpec, player: PlayerID): AgentBinding {
  return {
    spec,
    player,
    strategy: AIPlayer.createStrategy(spec.difficulty),
  };
}

async function chooseAction(
  binding: AgentBinding,
  state: GameState,
  validActions: GameAction[],
): Promise<GameAction | null> {
  if (validActions.length === 0) return null;
  if (validActions.length === 1) return validActions[0];

  const sanitized = AIPlayer.sanitizeStateForAI(state, binding.player);
  if (binding.spec.mode === 'neural' && binding.strategy.chooseActionAsync) {
    return binding.strategy.chooseActionAsync(sanitized, binding.player, validActions);
  }

  return binding.strategy.chooseAction(sanitized, binding.player, validActions);
}

async function playMatch(
  allCards: any[],
  gameNumber: number,
  swapSeats: boolean,
  agentA: AgentSpec,
  agentB: AgentSpec,
): Promise<MatchResult> {
  const player1Agent = swapSeats ? bindAgent(agentB, 'player1') : bindAgent(agentA, 'player1');
  const player2Agent = swapSeats ? bindAgent(agentA, 'player2') : bindAgent(agentB, 'player2');

  const { deck: deck1, missions: missions1 } = buildRandomDeck(allCards);
  const { deck: deck2, missions: missions2 } = buildRandomDeck(allCards);

  const config: GameConfig = {
    player1: {
      userId: null,
      isAI: true,
      aiDifficulty: player1Agent.spec.difficulty,
      deck: deck1,
      missionCards: missions1,
    },
    player2: {
      userId: null,
      isAI: true,
      aiDifficulty: player2Agent.spec.difficulty,
      deck: deck2,
      missionCards: missions2,
    },
  };

  let state = GameEngine.createGame(config);
  let steps = 0;
  const startedAt = Date.now();
  let lastLiveLogAt = startedAt;

  while (state.phase !== 'gameOver' && steps < MAX_STEPS) {
    steps++;
    const actingPlayer = getDecisionPlayer(state);

    let validActions: GameAction[];
    try {
      validActions = GameEngine.getValidActions(state, actingPlayer);
    } catch {
      break;
    }

    const now = Date.now();
    if (now - lastLiveLogAt >= LIVE_LOG_EVERY_MS) {
      console.log(
        `  [LIVE] Game ${gameNumber}/${args.games} | ` +
        `step ${steps} | phase=${state.phase} | player=${actingPlayer} | ` +
        `actions=${validActions.length} | ${(now - startedAt) / 1000}s`,
      );
      lastLiveLogAt = now;
    }

    if (validActions.length === 0) {
      const advanced = tryAutoAdvance(state, actingPlayer);
      if (advanced) {
        state = advanced;
        continue;
      }
      break;
    }

    const agent = actingPlayer === 'player1' ? player1Agent : player2Agent;
    const action = await chooseAction(agent, state, validActions);
    if (!action) break;

    try {
      state = GameEngine.applyAction(state, actingPlayer, action);
    } catch {
      break;
    }
  }

  const durationMs = Date.now() - startedAt;
  if (state.phase !== 'gameOver') {
    return {
      winner: 'skipped',
      pointsA: 0,
      pointsB: 0,
      durationMs,
      steps,
      usedTiebreak: false,
    };
  }

  const agentAPlayer: PlayerID = swapSeats ? 'player2' : 'player1';
  const agentBPlayer: PlayerID = swapSeats ? 'player1' : 'player2';
  const player1Points = safeNumber(state.player1.missionPoints);
  const player2Points = safeNumber(state.player2.missionPoints);
  const pointsA = safeNumber(state[agentAPlayer].missionPoints);
  const pointsB = safeNumber(state[agentBPlayer].missionPoints);

  let winnerPlayer: PlayerID;
  const usedTiebreak = player1Points === player2Points;
  if (player1Points > player2Points) {
    winnerPlayer = 'player1';
  } else if (player2Points > player1Points) {
    winnerPlayer = 'player2';
  } else {
    winnerPlayer = state.edgeHolder;
  }

  return {
    winner: winnerPlayer === agentAPlayer ? 'A' : 'B',
    pointsA,
    pointsB,
    durationMs,
    steps,
    usedTiebreak,
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('  NARUTO MYTHOS TCG - AI benchmark');
  console.log('='.repeat(60));
  console.log(`  Games:        ${args.games}`);
  console.log(`  Agent A:      ${args.a} (${args.aMode})`);
  console.log(`  Agent B:      ${args.b} (${args.bMode})`);
  console.log(`  Swap seats:   ${args.swapSeats}`);
  console.log('='.repeat(60));

  console.log('\nLoading cards...');
  const allCards = getAllCards();
  console.log(`  ${allCards.length} cards loaded`);

  const agentA: AgentSpec = { label: 'A', difficulty: args.a, mode: args.aMode };
  const agentB: AgentSpec = { label: 'B', difficulty: args.b, mode: args.bMode };

  let aWins = 0;
  let bWins = 0;
  let skipped = 0;
  let totalSteps = 0;
  let totalDurationMs = 0;
  let tiebreaks = 0;
  const startedAt = Date.now();

  for (let i = 0; i < args.games; i++) {
    const swapSeats = args.swapSeats && i % 2 === 1;
    const result = await playMatch(allCards, i + 1, swapSeats, agentA, agentB);

    totalDurationMs += result.durationMs;
    totalSteps += result.steps;
    if (result.usedTiebreak) tiebreaks++;

    if (result.winner === 'A') {
      aWins++;
    } else if (result.winner === 'B') {
      bWins++;
    } else {
      skipped++;
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === args.games - 1) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = elapsedSec > 0 ? (i + 1) / elapsedSec : 0;
      const etaSec = rate > 0 ? (args.games - i - 1) / rate : 0;
      console.log(
        `  Game ${i + 1}/${args.games} | ` +
        `A ${aWins} - B ${bWins} | skipped ${skipped} | ` +
        `${rate.toFixed(2)} games/s | ETA ${Math.round(etaSec)}s`,
      );
    }
  }

  const completed = aWins + bWins;
  const elapsedSec = (Date.now() - startedAt) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('Benchmark complete');
  console.log(`A wins:        ${aWins}`);
  console.log(`B wins:        ${bWins}`);
  console.log(`Skipped:       ${skipped}`);
  if (completed > 0) {
    console.log(`A winrate:     ${(100 * aWins / completed).toFixed(1)}%`);
    console.log(`B winrate:     ${(100 * bWins / completed).toFixed(1)}%`);
  }
  console.log(`Tie-breaks:    ${tiebreaks}`);
  console.log(`Avg steps:     ${(totalSteps / Math.max(1, args.games)).toFixed(1)}`);
  console.log(`Avg game time: ${(totalDurationMs / Math.max(1, args.games) / 1000).toFixed(2)}s`);
  console.log(`Total time:    ${elapsedSec.toFixed(1)}s`);
  console.log('='.repeat(60));
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const result: {
    games: number;
    a: AIDifficulty;
    b: AIDifficulty;
    aMode: AgentMode;
    bMode: AgentMode;
    swapSeats: boolean;
  } = {
    games: 100,
    a: 'impossible',
    b: 'impossible',
    aMode: 'neural',
    bMode: 'heuristic',
    swapSeats: true,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--games' && argv[i + 1]) result.games = parseInt(argv[++i], 10);
    if (argv[i] === '--a' && argv[i + 1]) result.a = parseDifficulty(argv[++i]);
    if (argv[i] === '--b' && argv[i + 1]) result.b = parseDifficulty(argv[++i]);
    if (argv[i] === '--a-mode' && argv[i + 1]) result.aMode = parseMode(argv[++i]);
    if (argv[i] === '--b-mode' && argv[i + 1]) result.bMode = parseMode(argv[++i]);
    if (argv[i] === '--no-swap') result.swapSeats = false;
  }

  return result;
}

function parseDifficulty(value: string): AIDifficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'impossible') {
    return value;
  }
  throw new Error(`Invalid difficulty: ${value}`);
}

function parseMode(value: string): AgentMode {
  if (value === 'heuristic' || value === 'neural') {
    return value;
  }
  throw new Error(`Invalid mode: ${value}`);
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
