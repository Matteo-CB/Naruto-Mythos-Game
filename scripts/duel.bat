@echo off
REM ============================================================
REM  NARUTO MYTHOS TCG — Duel IA rapide (Windows)
REM
REM  Usage:
REM    duel.bat                   -> mode rapide par defaut
REM    duel.bat fast              -> 50 parties, heuristique pur
REM    duel.bat standard          -> 100 parties, heuristique
REM    duel.bat neural            -> 100 parties, NN vs heuristique
REM    duel.bat deep              -> 200 parties, NN vs heuristique
REM    duel.bat hard              -> hard vs impossible (rapide)
REM
REM  Variables personnalisables :
REM    set A=impossible           -> difficulte IA A
REM    set B=hard                 -> difficulte IA B
REM    set GAMES=100              -> nb de parties
REM    set SIMS=150               -> simulations par IA
REM    set WORKERS=6              -> workers paralleles
REM ============================================================

setlocal

set MODE=%1
if "%MODE%"=="" set MODE=fast

REM === Defaults ===
set A=impossible
set B=impossible
set GAMES=100
set SIMS=150
set WORKERS=6
set A_MODE=heuristic
set B_MODE=heuristic
set DECKS=ai_training/strong_decks_curated.json
set OUTPUT=scripts/bench/duel_result.json

if "%MODE%"=="fast" (
    echo [DUEL] Mode: RAPIDE ^| 50 parties ^| heuristique pur ^| 100 sims
    set GAMES=50
    set SIMS=100
    set WORKERS=6
    set A_MODE=heuristic
    set B_MODE=heuristic
    goto run
)

if "%MODE%"=="standard" (
    echo [DUEL] Mode: STANDARD ^| 100 parties ^| heuristique ^| 150 sims
    set GAMES=100
    set SIMS=150
    set WORKERS=6
    set A_MODE=heuristic
    set B_MODE=heuristic
    goto run
)

if "%MODE%"=="neural" (
    echo [DUEL] Mode: NEURAL ^| 100 parties ^| NN vs heuristique ^| 250 sims
    echo [INFO] Le reseau de neurones tourne sur CPU ^(pas CUDA sur Windows^) - un peu plus lent
    set GAMES=100
    set SIMS=250
    set WORKERS=4
    set A_MODE=neural
    set B_MODE=heuristic
    goto run
)

if "%MODE%"=="deep" (
    echo [DUEL] Mode: DEEP ^| 200 parties ^| NN vs heuristique ^| 400 sims
    set GAMES=200
    set SIMS=400
    set WORKERS=4
    set A_MODE=neural
    set B_MODE=heuristic
    goto run
)

if "%MODE%"=="hard" (
    echo [DUEL] Mode: HARD vs IMPOSSIBLE
    set A=hard
    set B=impossible
    set GAMES=100
    set SIMS=150
    set WORKERS=6
    set A_MODE=heuristic
    set B_MODE=heuristic
    goto run
)

echo [ERROR] Mode inconnu: %MODE%
echo Modes disponibles: fast, standard, neural, deep, hard
exit /b 1

:run
echo ============================================================
echo  A: %A% ^(%A_MODE%^)  vs  B: %B% ^(%B_MODE%^)
echo  Parties: %GAMES%  ^|  Sims: %SIMS%  ^|  Workers: %WORKERS%
echo  Decks: %DECKS%
echo ============================================================

node -r tsconfig-paths/register node_modules/ts-node/dist/bin.js ^
  --project scripts/tsconfig.json ^
  scripts/benchmarkParallel.ts ^
  --a %A% ^
  --b %B% ^
  --a-mode %A_MODE% ^
  --b-mode %B_MODE% ^
  --a-sims %SIMS% ^
  --b-sims %SIMS% ^
  --games %GAMES% ^
  --workers %WORKERS% ^
  --decks %DECKS% ^
  --output %OUTPUT%

echo.
echo [DUEL] Resultat sauvegarde dans: %OUTPUT%
endlocal
