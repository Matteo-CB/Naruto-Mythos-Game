import { GameEngine } from '../lib/engine/GameEngine';
import { GameConfig, GameState, PlayerID } from '../lib/engine/types';
import { NeuralISMCTS } from '../lib/ai/neural/NeuralISMCTS';
import { FeatureExtractor } from '../lib/ai/neural/FeatureExtractor';
import { AIPlayer } from '../lib/ai/AIPlayer';
import { getAllCards } from '../lib/data/cardLoader';
import * as fs from 'fs';
import * as path from 'path';

const args = parseArgs();
const NUM_GAMES = args.games;
const OUTPUT_PATH = args.output;
const SIMULATIONS = args.sims;
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
  const { deck: deck1, missions: missions1 } = buildRandomDeck(allCards);
  const { deck: deck2, missions: missions2 } = buildRandomDeck(allCards);

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
  console.log('='.repeat(60));
  console.log('  NARUTO MYTHOS TCG - Generation de donnees self-play');
  console.log('='.repeat(60));
  console.log(`  Parties:      ${NUM_GAMES}`);
  console.log(`  Simulations:  ${SIMULATIONS} par action`);
  console.log(`  Sortie:       ${OUTPUT_PATH}`);
  console.log('='.repeat(60));

  console.log('\nChargement des cartes...');

  let allCards: any[] = [];
  try {
    allCards = getAllCards();
    console.log(`  ${allCards.length} cartes chargees`);
  } catch (err) {
    console.error('Erreur chargement cartes:', err);
    process.exit(1);
  }

  const allSamples: TrainingSample[] = [];
  let gamesCompleted = 0;
  let gamesSkipped = 0;
  let debugShown = false;
  const startTime = Date.now();

  for (let i = 0; i < NUM_GAMES; i++) {
    try {
      const samples = await playOneGame(allCards, {
        debug: !debugShown,
        gameNumber: i + 1,
        onHeartbeat: (info) => {
          console.log(
            `  [LIVE] Partie ${info.gameNumber}/${NUM_GAMES} | ` +
            `step ${info.step} | phase=${info.phase} | joueur=${info.player} | ` +
            `actions=${info.validActions} | samples=${info.partialSamples} | ` +
            `${(info.elapsedMs / 1000).toFixed(1)}s`,
          );
        },
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

    if ((i + 1) % SUMMARY_LOG_EVERY === 0 || i === NUM_GAMES - 1) {
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
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n' + '='.repeat(60));
  console.log(`Termine en ${elapsed.toFixed(0)}s`);
  console.log(`${allSamples.length.toLocaleString()} samples de ${gamesCompleted} parties`);

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
  console.log(`Donnees sauvees: ${OUTPUT_PATH} (${sizeMB.toFixed(1)} MB)`);
  console.log('\nProchaine etape:');
  console.log(`  cd ai_training && python train.py --data ../${OUTPUT_PATH} --gpu --epochs 50`);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const result = {
    games: 2000,
    output: 'scripts/training_data.json',
    sims: 100,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--games' && argv[i + 1]) result.games = parseInt(argv[++i], 10);
    if (argv[i] === '--output' && argv[i + 1]) result.output = argv[++i];
    if (argv[i] === '--sims' && argv[i + 1]) result.sims = parseInt(argv[++i], 10);
  }

  return result;
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
