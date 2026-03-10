/* eslint-disable @typescript-eslint/no-explicit-any */
import { GameEngine } from '../lib/engine/GameEngine';
import type { GameAction, GameConfig, GameState, PlayerID } from '../lib/engine/types';
import { AIPlayer, type AIDifficulty, type AIStrategy } from '../lib/ai/AIPlayer';
import { getAllCards, resolveCardId } from '../lib/data/cardLoader';
import * as fs from 'fs';
import * as path from 'path';

type AgentMode = 'heuristic' | 'neural';
type BenchmarkPhase = 'running' | 'done' | 'error';

interface AgentSpec {
  label: 'A' | 'B';
  difficulty: AIDifficulty;
  mode: AgentMode;
  modelPath?: string;
  simulations?: number;
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

interface DeckPoolEntry {
  name?: string;
  deck: any[];
  missions: any[];
}

interface MatchLiveState {
  step: number;
  phase: string;
  player: PlayerID;
  validActions: number;
  elapsedSec: number;
}

interface BenchmarkProgress {
  phase: BenchmarkPhase;
  currentGame: number;
  totalGames: number;
  completed: number;
  aWins: number;
  bWins: number;
  skipped: number;
  elapsedSec: number;
  rateGamesPerSec: number;
  etaSec: number;
  outputPath: string;
  timestamp: number;
  activeGame?: number;
  currentStep?: number;
  currentPhase?: string;
  currentPlayer?: string;
  currentValidActions?: number;
  currentGameElapsedSec?: number;
  message?: string;
}

const args = parseArgs();
const PROGRESS_EVERY = Math.max(1, Math.min(10, Math.floor(args.games / 10) || 1));
const MAX_STEPS = 1200;
const LIVE_LOG_EVERY_MS = 5000;

function safeNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function versionKey(cardId: string): string {
  return cardId.replace(/\s*A$/, '').trim();
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

function loadDeckPool(allCards: any[], deckFilePath: string): DeckPoolEntry[] {
  if (!deckFilePath || !fs.existsSync(deckFilePath)) return [];

  const raw = JSON.parse(fs.readFileSync(deckFilePath, 'utf-8'));
  const entries = Array.isArray(raw) ? raw : (raw.decks ?? []);
  if (!Array.isArray(entries)) return [];

  const allCharacters = allCards.filter((card) => card.card_type === 'character' && card.has_visual);
  const allMissions = allCards.filter((card) => card.card_type === 'mission' && card.has_visual);
  const charMap = new Map(allCharacters.map((card) => [card.id, card]));
  const missionMap = new Map(allMissions.map((card) => [card.id, card]));

  const pool: DeckPoolEntry[] = [];

  for (const entry of entries) {
    const cardIds = Array.isArray(entry.cardIds) ? entry.cardIds : [];
    const missionIds = Array.isArray(entry.missionIds) ? entry.missionIds : [];
    if (cardIds.length === 0 || missionIds.length === 0) continue;

    const chars: any[] = [];
    const versionCounts = new Map<string, number>();
    for (const rawId of cardIds) {
      const resolved = resolveCardId(rawId);
      const card = charMap.get(resolved);
      if (!card) continue;
      const key = versionKey(card.id);
      const count = versionCounts.get(key) ?? 0;
      if (count >= 2) continue;
      versionCounts.set(key, count + 1);
      chars.push(card);
      if (chars.length >= 30) break;
    }

    const missions: any[] = [];
    const missionSeen = new Set<string>();
    for (const rawId of missionIds) {
      const resolved = resolveCardId(rawId);
      const mission = missionMap.get(resolved);
      if (!mission || missionSeen.has(mission.id)) continue;
      missionSeen.add(mission.id);
      missions.push(mission);
      if (missions.length >= 3) break;
    }

    if (chars.length < 30) {
      const fallbackChars = [...allCharacters].sort(() => Math.random() - 0.5);
      for (const card of fallbackChars) {
        if (chars.length >= 30) break;
        const key = versionKey(card.id);
        const count = versionCounts.get(key) ?? 0;
        if (count >= 2) continue;
        versionCounts.set(key, count + 1);
        chars.push(card);
      }
    }

    if (missions.length < 3) {
      const fallbackMissions = [...allMissions].sort(() => Math.random() - 0.5);
      for (const mission of fallbackMissions) {
        if (missions.length >= 3) break;
        if (missionSeen.has(mission.id)) continue;
        missionSeen.add(mission.id);
        missions.push(mission);
      }
    }

    if (chars.length === 30 && missions.length === 3) {
      pool.push({
        name: typeof entry.name === 'string' ? entry.name : undefined,
        deck: chars.slice(0, 30),
        missions: missions.slice(0, 3),
      });
    }
  }

  return pool;
}

function buildDeckForBenchmark(allCards: any[], deckPool: DeckPoolEntry[]): { deck: any[]; missions: any[] } {
  if (deckPool.length > 0 && Math.random() < 0.85) {
    const source = deckPool[Math.floor(Math.random() * deckPool.length)];
    return {
      deck: [...source.deck].sort(() => Math.random() - 0.5),
      missions: [...source.missions].sort(() => Math.random() - 0.5).slice(0, 3),
    };
  }

  return buildRandomDeck(allCards);
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
    strategy: AIPlayer.createStrategy(spec.difficulty, {
      modelPath: spec.mode === 'neural' ? spec.modelPath : undefined,
      simulations: spec.simulations,
    }),
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
  deckPool: DeckPoolEntry[],
  gameNumber: number,
  swapSeats: boolean,
  agentA: AgentSpec,
  agentB: AgentSpec,
  onLiveState?: (liveState: MatchLiveState) => void,
): Promise<MatchResult> {
  const player1Agent = swapSeats ? bindAgent(agentB, 'player1') : bindAgent(agentA, 'player1');
  const player2Agent = swapSeats ? bindAgent(agentA, 'player2') : bindAgent(agentB, 'player2');

  const { deck: deck1, missions: missions1 } = buildDeckForBenchmark(allCards, deckPool);
  const { deck: deck2, missions: missions2 } = buildDeckForBenchmark(allCards, deckPool);

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
      const liveState: MatchLiveState = {
        step: steps,
        phase: state.phase,
        player: actingPlayer,
        validActions: validActions.length,
        elapsedSec: (now - startedAt) / 1000,
      };

      if (!args.quiet) {
        console.log(
          `  [LIVE] Game ${gameNumber}/${args.games} | ` +
            `step ${steps} | phase=${state.phase} | player=${actingPlayer} | ` +
            `actions=${validActions.length} | ${liveState.elapsedSec}s`,
        );
      }
      onLiveState?.(liveState);
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
  const log = (...messages: string[]) => {
    if (!args.quiet) {
      for (const message of messages) {
        console.log(message);
      }
    }
  };

  let aWins = 0;
  let bWins = 0;
  let skipped = 0;
  let totalSteps = 0;
  let totalDurationMs = 0;
  let tiebreaks = 0;
  const startedAt = Date.now();

  const writeProgress = (
    phase: BenchmarkPhase,
    activeGame?: number,
    liveState?: MatchLiveState,
    message?: string,
  ) => {
    if (!args.progressFile) return;

    const finishedGames = aWins + bWins + skipped;
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const currentGame = phase === 'done' ? args.games : finishedGames;
    const rateGamesPerSec = elapsedSec > 0 ? currentGame / elapsedSec : 0;
    const remainingGames = Math.max(0, args.games - currentGame);
    const etaSec = rateGamesPerSec > 0 ? remainingGames / rateGamesPerSec : 0;
    const progress: BenchmarkProgress = {
      phase,
      currentGame,
      totalGames: args.games,
      completed: aWins + bWins,
      aWins,
      bWins,
      skipped,
      elapsedSec,
      rateGamesPerSec,
      etaSec,
      outputPath: args.output || '',
      timestamp: Date.now(),
      activeGame,
      message,
    };

    if (liveState) {
      progress.currentStep = liveState.step;
      progress.currentPhase = liveState.phase;
      progress.currentPlayer = liveState.player;
      progress.currentValidActions = liveState.validActions;
      progress.currentGameElapsedSec = liveState.elapsedSec;
    }

    const progressPath = path.resolve(args.progressFile);
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.writeFileSync(progressPath, JSON.stringify(progress), 'utf-8');
  };

  log('='.repeat(60));
  log('  NARUTO MYTHOS TCG - AI benchmark');
  log('='.repeat(60));
  log(`  Games:        ${args.games}`);
  log(`  Agent A:      ${args.a} (${args.aMode})`);
  log(`  Agent B:      ${args.b} (${args.bMode})`);
  if (args.aSims > 0) log(`  A sims:       ${args.aSims}`);
  if (args.bSims > 0) log(`  B sims:       ${args.bSims}`);
  if (args.aModel) log(`  A model:      ${args.aModel}`);
  if (args.bModel) log(`  B model:      ${args.bModel}`);
  log(`  Swap seats:   ${args.swapSeats}`);
  if (args.decks) log(`  Decks:        ${args.decks}`);
  log('='.repeat(60));

  log('\nLoading cards...');
  const allCards = getAllCards();
  log(`  ${allCards.length} cards loaded`);
  const deckPool = args.decks ? loadDeckPool(allCards, args.decks) : [];
  if (deckPool.length > 0) {
    log(`  ${deckPool.length} strong decks loaded`);
  } else if (args.decks) {
    log('  No valid strong decks loaded, using random decks');
  }

  const agentA: AgentSpec = {
    label: 'A',
    difficulty: args.a,
    mode: args.aMode,
    modelPath: args.aModel || undefined,
    simulations: args.aSims > 0 ? args.aSims : undefined,
  };
  const agentB: AgentSpec = {
    label: 'B',
    difficulty: args.b,
    mode: args.bMode,
    modelPath: args.bModel || undefined,
    simulations: args.bSims > 0 ? args.bSims : undefined,
  };

  writeProgress('running');

  for (let i = 0; i < args.games; i++) {
    const swapSeats = args.swapSeats && i % 2 === 1;
    const currentGame = i + 1;
    writeProgress('running', currentGame);
    const result = await playMatch(
      allCards,
      deckPool,
      currentGame,
      swapSeats,
      agentA,
      agentB,
      (liveState) => writeProgress('running', currentGame, liveState),
    );

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
      log(
        `  Game ${i + 1}/${args.games} | ` +
        `A ${aWins} - B ${bWins} | skipped ${skipped} | ` +
        `${rate.toFixed(2)} games/s | ETA ${Math.round(etaSec)}s`,
      );
    }

    writeProgress('running');
  }

  const completed = aWins + bWins;
  const elapsedSec = (Date.now() - startedAt) / 1000;

  log('\n' + '='.repeat(60));
  log('Benchmark complete');
  log(`A wins:        ${aWins}`);
  log(`B wins:        ${bWins}`);
  log(`Skipped:       ${skipped}`);
  if (completed > 0) {
    log(`A winrate:     ${(100 * aWins / completed).toFixed(1)}%`);
    log(`B winrate:     ${(100 * bWins / completed).toFixed(1)}%`);
  }
  log(`Tie-breaks:    ${tiebreaks}`);
  log(`Avg steps:     ${(totalSteps / Math.max(1, args.games)).toFixed(1)}`);
  log(`Avg game time: ${(totalDurationMs / Math.max(1, args.games) / 1000).toFixed(2)}s`);
  log(`Total time:    ${elapsedSec.toFixed(1)}s`);
  log('='.repeat(60));

  if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          config: {
            games: args.games,
            a: args.a,
            b: args.b,
            aMode: args.aMode,
            bMode: args.bMode,
            aModel: args.aModel || null,
            bModel: args.bModel || null,
            aSims: args.aSims || null,
            bSims: args.bSims || null,
            swapSeats: args.swapSeats,
            decks: args.decks || null,
          },
          summary: {
            aWins,
            bWins,
            skipped,
            completed,
            aWinrate: completed > 0 ? aWins / completed : 0,
            bWinrate: completed > 0 ? bWins / completed : 0,
            tiebreaks,
            totalSteps,
            totalDurationMs,
            avgSteps: totalSteps / Math.max(1, args.games),
            avgGameTimeSec: totalDurationMs / Math.max(1, args.games) / 1000,
            totalTimeSec: elapsedSec,
          },
        },
        null,
        2,
      ),
      'utf-8',
    );
    log(`Report saved: ${outputPath}`);
  }

  writeProgress('done');
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
    decks: string;
    output: string;
    aModel: string;
    bModel: string;
    aSims: number;
    bSims: number;
    progressFile: string;
    quiet: boolean;
  } = {
    games: 100,
    a: 'impossible',
    b: 'impossible',
    aMode: 'neural',
    bMode: 'heuristic',
    swapSeats: true,
    decks: '',
    output: '',
    aModel: '',
    bModel: '',
    aSims: 0,
    bSims: 0,
    progressFile: '',
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--games' && argv[i + 1]) result.games = parseInt(argv[++i], 10);
    if (argv[i] === '--a' && argv[i + 1]) result.a = parseDifficulty(argv[++i]);
    if (argv[i] === '--b' && argv[i + 1]) result.b = parseDifficulty(argv[++i]);
    if (argv[i] === '--a-mode' && argv[i + 1]) result.aMode = parseMode(argv[++i]);
    if (argv[i] === '--b-mode' && argv[i + 1]) result.bMode = parseMode(argv[++i]);
    if (argv[i] === '--no-swap') result.swapSeats = false;
    if (argv[i] === '--decks' && argv[i + 1]) result.decks = argv[++i];
    if (argv[i] === '--output' && argv[i + 1]) result.output = argv[++i];
    if (argv[i] === '--a-model' && argv[i + 1]) result.aModel = argv[++i];
    if (argv[i] === '--b-model' && argv[i + 1]) result.bModel = argv[++i];
    if (argv[i] === '--a-sims' && argv[i + 1]) result.aSims = parseInt(argv[++i], 10);
    if (argv[i] === '--b-sims' && argv[i + 1]) result.bSims = parseInt(argv[++i], 10);
    if (argv[i] === '--progress-file' && argv[i + 1]) result.progressFile = argv[++i];
    if (argv[i] === '--quiet') result.quiet = true;
  }

  result.aSims = Math.max(0, result.aSims || 0);
  result.bSims = Math.max(0, result.bSims || 0);
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
  if (args.progressFile) {
    try {
      const progressPath = path.resolve(args.progressFile);
      fs.mkdirSync(path.dirname(progressPath), { recursive: true });
      const progress: BenchmarkProgress = {
        phase: 'error',
        currentGame: 0,
        totalGames: args.games,
        completed: 0,
        aWins: 0,
        bWins: 0,
        skipped: 0,
        elapsedSec: 0,
        rateGamesPerSec: 0,
        etaSec: 0,
        outputPath: args.output || '',
        timestamp: Date.now(),
        message: err instanceof Error ? err.message : String(err),
      };
      fs.writeFileSync(progressPath, JSON.stringify(progress), 'utf-8');
    } catch {
      // ignore progress write failure on fatal exit
    }
  }
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
