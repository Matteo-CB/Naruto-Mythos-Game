import { GameEngine } from '../lib/engine/GameEngine';
import { GameConfig, GameState, PlayerID } from '../lib/engine/types';
import { NeuralISMCTS } from '../lib/ai/neural/NeuralISMCTS';
import { FeatureExtractor } from '../lib/ai/neural/FeatureExtractor';
import { AIPlayer } from '../lib/ai/AIPlayer';
import { getAllCards, resolveCardId } from '../lib/data/cardLoader';
import * as fs from 'fs';
import * as path from 'path';

const args = parseArgs();
const NUM_GAMES = args.games;
const OUTPUT_PATH = args.output;
const SIMULATIONS = args.sims;
const STRONG_DECKS_PATH = args.decks;
const QUIET = args.quiet;
const PROGRESS_FILE = args.progressFile;
const SUMMARY_LOG_EVERY = Math.max(1, Math.min(25, Math.floor(NUM_GAMES / 100) || 1));
const LIVE_LOG_EVERY_MS = 3000;

const selfPlayMCTS = new NeuralISMCTS({
  simulations: SIMULATIONS,
  maxDepth: 5,
  explorationC: 1.41,
  evaluator: null,
  maxBranching: 10,
  useBatchedEval: false,
});

interface TrainingSample {
  features: number[];
  features_flipped: number[];
  outcome: number;
}

interface LiveProgressInfo {
  gameNumber: number;
  step: number;
  phase: GameState['phase'];
  player: PlayerID;
  validActions: number;
  partialSamples: number;
  elapsedMs: number;
}

interface DeckPoolEntry {
  name?: string;
  deck: any[];
  missions: any[];
}

type ProgressPhase = 'running' | 'done' | 'error';

function writeProgress(payload: {
  phase: ProgressPhase;
  currentGame: number;
  totalGames: number;
  completed: number;
  skipped: number;
  samples: number;
  elapsedSec: number;
  rateGamesPerSec: number;
  etaSec: number;
  outputPath: string;
  sims: number;
  timestamp: number;
  message?: string;
  currentStep?: number;
  currentPhase?: GameState['phase'];
  currentPlayer?: PlayerID;
  currentValidActions?: number;
  currentGameElapsedSec?: number;
}) {
  if (!PROGRESS_FILE) return;
  try {
    const absPath = path.resolve(PROGRESS_FILE);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const tempPath = `${absPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload), 'utf-8');
    fs.renameSync(tempPath, absPath);
  } catch {
    // Ignore progress write failures (best-effort telemetry only).
  }
}

function serializeFeatures(features: Float32Array): number[] {
  return Array.from(features, (value) => {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  });
}

function buildRandomDeck(allCards: any[]): { deck: any[]; missions: any[] } {
  const characters = allCards.filter(
    (card) => card.card_type === 'character' && card.has_visual,
  );
  const missions = allCards.filter(
    (card) => card.card_type === 'mission' && card.has_visual,
  );

  if (characters.length < 30) {
    throw new Error(`Pas assez de cartes personnages (${characters.length} < 30)`);
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

function versionKey(cardId: string): string {
  return cardId.replace(/\s*A$/, '').trim();
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

function buildDeckForSelfPlay(allCards: any[], deckPool: DeckPoolEntry[]): { deck: any[]; missions: any[] } {
  if (deckPool.length > 0 && Math.random() < 0.8) {
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

function hasInteractivePending(state: GameState, player: PlayerID): boolean {
  if (state.pendingActions.some((pending) => pending.player === player)) {
    return true;
  }

  return state.pendingEffects.some(
    (effect) => effect.isOptional && !effect.resolved && effect.sourcePlayer === player,
  );
}

function recordSample(state: GameState, samples: TrainingSample[]) {
  const sanitized1 = AIPlayer.sanitizeStateForAI(state, 'player1');
  const sanitized2 = AIPlayer.sanitizeStateForAI(state, 'player2');
  const featuresP1 = FeatureExtractor.extract(sanitized1, 'player1');
  const featuresP2 = FeatureExtractor.extract(sanitized2, 'player1');

  samples.push({
    features: serializeFeatures(featuresP1),
    features_flipped: serializeFeatures(featuresP2),
    outcome: -1,
  });
}

async function playOneGame(
  allCards: any[],
  deckPool: DeckPoolEntry[],
  options: {
    debug?: boolean;
    gameNumber?: number;
    onHeartbeat?: (info: LiveProgressInfo) => void;
  } = {},
): Promise<TrainingSample[]> {
  const {
    debug = false,
    gameNumber = 0,
    onHeartbeat,
  } = options;
  const { deck: deck1, missions: missions1 } = buildDeckForSelfPlay(allCards, deckPool);
  const { deck: deck2, missions: missions2 } = buildDeckForSelfPlay(allCards, deckPool);

  const config: GameConfig = {
    player1: {
      userId: null,
      isAI: true,
      aiDifficulty: 'hard',
      deck: deck1,
      missionCards: missions1,
    },
    player2: {
      userId: null,
      isAI: true,
      aiDifficulty: 'hard',
      deck: deck2,
      missionCards: missions2,
    },
  };

  let state = GameEngine.createGame(config);
  const samples: TrainingSample[] = [];
  let safetyCounter = 0;
  const MAX_STEPS = 1200;
  const gameStartTime = Date.now();
  let lastHeartbeatAt = gameStartTime;

  while (state.phase !== 'gameOver' && safetyCounter < MAX_STEPS) {
    safetyCounter++;

    const actingPlayer = getDecisionPlayer(state);
    let validActions: any[];

    try {
      validActions = GameEngine.getValidActions(state, actingPlayer);
    } catch (err) {
      if (debug) {
        console.error(`[DEBUG] getValidActions crash phase=${state.phase} player=${actingPlayer}:`, err);
      }
      break;
    }

    if (debug && safetyCounter <= 10) {
      console.log(
        `[DEBUG] step=${safetyCounter} phase=${state.phase} ` +
        `player=${actingPlayer} validActions=${validActions.length} ` +
        `pendingActions=${state.pendingActions.length} pendingEffects=${state.pendingEffects.length}`,
      );
    } else if (onHeartbeat) {
      const now = Date.now();
      if (now - lastHeartbeatAt >= LIVE_LOG_EVERY_MS) {
        onHeartbeat({
          gameNumber,
          step: safetyCounter,
          phase: state.phase,
          player: actingPlayer,
          validActions: validActions.length,
          partialSamples: samples.length,
          elapsedMs: now - gameStartTime,
        });
        lastHeartbeatAt = now;
      }
    }

    let action: any;

    if (state.phase === 'mulligan') {
      const keepAction = validActions.find(
        (candidate: any) => candidate.type === 'MULLIGAN' && !candidate.doMulligan,
      );
      action = keepAction ?? validActions[0];

      if (!action) {
        if (debug) console.error('[DEBUG] no mulligan action available');
        break;
      }
    } else if (state.phase === 'action') {
      if (validActions.length === 0) {
        if (debug) console.error(`[DEBUG] no action available in action phase for ${actingPlayer}`);
        break;
      }

      recordSample(state, samples);

      if (validActions.length === 1 || hasInteractivePending(state, actingPlayer)) {
        action = validActions[0];
      } else {
        const sanitized = AIPlayer.sanitizeStateForAI(state, actingPlayer);
        action = selfPlayMCTS.chooseActionSync(sanitized, actingPlayer, validActions);
      }
    } else if (state.phase === 'mission' || state.phase === 'end') {
      action = validActions.length > 0 ? validActions[0] : { type: 'ADVANCE_PHASE' };
    } else {
      action = validActions.length > 0 ? validActions[0] : { type: 'ADVANCE_PHASE' };
    }

    try {
      state = GameEngine.applyAction(state, actingPlayer, action);
    } catch (err) {
      if (debug) {
        console.error(
          `[DEBUG] applyAction crash phase=${state.phase} player=${actingPlayer} action=${JSON.stringify(action)}:`,
          err,
        );
      }
      break;
    }
  }

  if (state.phase !== 'gameOver') {
    if (debug) {
      console.error(
        `[DEBUG] game skipped phase=${state.phase} step=${safetyCounter} ` +
        `pendingActions=${state.pendingActions.length} pendingEffects=${state.pendingEffects.length}`,
      );
    }
    return [];
  }

  let outcome = 0;
  const p1Points = state.player1.missionPoints;
  const p2Points = state.player2.missionPoints;

  if (p1Points > p2Points) {
    outcome = 1.0;
  } else if (p2Points > p1Points) {
    outcome = 0.0;
  } else {
    outcome = state.edgeHolder === 'player1' ? 1.0 : 0.0;
  }

  for (const sample of samples) {
    sample.outcome = outcome;
  }

  return samples;
}

async function main() {
  if (!QUIET) {
    console.log('='.repeat(60));
    console.log('  NARUTO MYTHOS TCG - Generation de donnees self-play');
    console.log('='.repeat(60));
    console.log(`  Parties:      ${NUM_GAMES}`);
    console.log(`  Simulations:  ${SIMULATIONS} par action`);
    console.log(`  Sortie:       ${OUTPUT_PATH}`);
    if (STRONG_DECKS_PATH) {
      console.log(`  Decks forts:  ${STRONG_DECKS_PATH}`);
    }
    console.log('='.repeat(60));
  }
  if (!QUIET) {
    console.log('\nChargement des cartes...');
  }

  let allCards: any[] = [];
  try {
    allCards = getAllCards();
    if (!QUIET) console.log(`  ${allCards.length} cartes chargees`);
  } catch (err) {
    console.error('Erreur chargement cartes:', err);
    process.exit(1);
  }

  const deckPool = STRONG_DECKS_PATH ? loadDeckPool(allCards, STRONG_DECKS_PATH) : [];
  if (deckPool.length > 0) {
    if (!QUIET) console.log(`  ${deckPool.length} decks forts charges pour le self-play`);
  } else if (STRONG_DECKS_PATH) {
    if (!QUIET) console.log('  Aucun deck fort valide charge â€” fallback sur decks aleatoires');
  }

  const allSamples: TrainingSample[] = [];
  let gamesCompleted = 0;
  let gamesSkipped = 0;
  let debugShown = false;
  const startTime = Date.now();
  const progressEvery = PROGRESS_FILE ? 1 : Math.max(1, Math.floor(NUM_GAMES / 250));

  const emitProgress = (
    phase: ProgressPhase,
    currentGame: number,
    message?: string,
    live?: LiveProgressInfo,
  ) => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const done = Math.max(0, Math.min(NUM_GAMES, currentGame));
    const rate = elapsedSec > 0 ? done / elapsedSec : 0;
    const eta = rate > 0 ? Math.max(0, (NUM_GAMES - done) / rate) : 0;
    writeProgress({
      phase,
      currentGame: done,
      totalGames: NUM_GAMES,
      completed: gamesCompleted,
      skipped: gamesSkipped,
      samples: allSamples.length,
      elapsedSec,
      rateGamesPerSec: rate,
      etaSec: eta,
      outputPath: OUTPUT_PATH,
      sims: SIMULATIONS,
      timestamp: Date.now(),
      message,
      currentStep: live?.step,
      currentPhase: live?.phase,
      currentPlayer: live?.player,
      currentValidActions: live?.validActions,
      currentGameElapsedSec: live ? live.elapsedMs / 1000 : undefined,
    });
  };

  emitProgress('running', 0);

  for (let i = 0; i < NUM_GAMES; i++) {
    try {
      const samples = await playOneGame(allCards, deckPool, {
        debug: !debugShown && !QUIET,
        gameNumber: i + 1,
        onHeartbeat: (!QUIET || Boolean(PROGRESS_FILE))
          ? (info) => {
              if (!QUIET) {
                console.log(
                  `  [LIVE] Partie ${info.gameNumber}/${NUM_GAMES} | ` +
                  `step ${info.step} | phase=${info.phase} | joueur=${info.player} | ` +
                  `actions=${info.validActions} | samples=${info.partialSamples} | ` +
                  `${(info.elapsedMs / 1000).toFixed(1)}s`,
                );
              }
              if (PROGRESS_FILE) {
                emitProgress('running', i, undefined, info);
              }
            }
          : undefined,
      });

      if (samples.length > 0) {
        allSamples.push(...samples);
        gamesCompleted++;
        debugShown = true;
      } else {
        gamesSkipped++;
      }
    } catch (err) {
      if (!debugShown) {
        console.error('[DEBUG] Erreur partie:', err);
        debugShown = true;
      }
      gamesSkipped++;
    }

    if (!QUIET && ((i + 1) % SUMMARY_LOG_EVERY === 0 || i === NUM_GAMES - 1)) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = elapsed > 0 ? (i + 1) / elapsed : 0;
      const eta = rate > 0 ? (NUM_GAMES - i - 1) / rate : 0;

      console.log(
        `  Partie ${i + 1}/${NUM_GAMES} | ` +
        `Completes: ${gamesCompleted} | Ignorees: ${gamesSkipped} | ` +
        `Samples: ${allSamples.length.toLocaleString()} | ` +
        `${rate.toFixed(1)} parties/s | ETA: ${Math.round(eta)}s`,
      );
    }

    if ((i + 1) % progressEvery === 0 || i === NUM_GAMES - 1) {
      emitProgress('running', i + 1);
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  if (!QUIET) {
    console.log('\n' + '='.repeat(60));
    console.log(`Termine en ${elapsed.toFixed(0)}s`);
    console.log(`${allSamples.length.toLocaleString()} samples de ${gamesCompleted} parties`);
  }

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ samples: allSamples }, null, 0),
    'utf-8',
  );

  const sizeMB = fs.statSync(OUTPUT_PATH).size / 1e6;
  if (!QUIET) {
    console.log(`Donnees sauvees: ${OUTPUT_PATH} (${sizeMB.toFixed(1)} MB)`);
    console.log('\nProchaine etape:');
    console.log(`  cd ai_training && python train.py --data ../${OUTPUT_PATH} --gpu --epochs 50`);
  }

  emitProgress('done', NUM_GAMES);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const result = {
    games: 2000,
    output: 'scripts/training_data.json',
    sims: 100,
    decks: '',
    quiet: false,
    progressFile: '',
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--games' && argv[i + 1]) result.games = parseInt(argv[++i], 10);
    if (argv[i] === '--output' && argv[i + 1]) result.output = argv[++i];
    if (argv[i] === '--sims' && argv[i + 1]) result.sims = parseInt(argv[++i], 10);
    if (argv[i] === '--decks' && argv[i + 1]) result.decks = argv[++i];
    if (argv[i] === '--quiet') result.quiet = true;
    if (argv[i] === '--progress-file' && argv[i + 1]) result.progressFile = argv[++i];
  }

  return result;
}

main().catch((err) => {
  try {
    writeProgress({
      phase: 'error',
      currentGame: 0,
      totalGames: NUM_GAMES,
      completed: 0,
      skipped: 0,
      samples: 0,
      elapsedSec: 0,
      rateGamesPerSec: 0,
      etaSec: 0,
      outputPath: OUTPUT_PATH,
      sims: SIMULATIONS,
      timestamp: Date.now(),
      message: String(err),
    });
  } catch {
    // ignore
  }
  console.error('Erreur fatale:', err);
  process.exit(1);
});
