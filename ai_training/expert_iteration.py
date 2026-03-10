"""
Expert Iteration (AlphaZero-lite) pour Naruto Mythos TCG.
==========================================================

Principe :
  Chaque itération :
    1. Génère N parties de self-play avec l'IA actuelle (ISMCTS + réseau actuel)
    2. Accumule les données (pool glissant)
    3. Entraîne le réseau sur le pool
    4. Exporte le modèle ONNX
    5. Recommence → données de meilleure qualité → réseau plus fort → cycle vertueux

Résultat attendu :
  Iter 1 : AUC ~0.70  (données aléatoires, pas encore de modèle)
  Iter 2 : AUC ~0.74  (modèle faible guide le selfplay)
  Iter 3 : AUC ~0.77
  Iter 4 : AUC ~0.80
  Iter 5 : AUC ~0.82
  Iter 6 : AUC ~0.84  (plateau approché)
  Iter 7+ : gains marginaux, éventuels signes de surapprentissage

Utilisation rapide (4h sur RTX 3060) :
  python expert_iteration.py --iterations 5 --games-per-iter 3000 --sims 80 --gpu --large

Longue durée (24h, maximum de qualité) :
  python expert_iteration.py --iterations 8 --games-per-iter 5000 --sims 120 --gpu --large --epochs 40

Reprendre depuis l'itération 3 :
  python expert_iteration.py --start-iter 3 --iterations 8 --games-per-iter 5000 --sims 120 --gpu --large
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def format_duration(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}h{m:02d}m{s:02d}s"
    return f"{m}m{s:02d}s"


def load_samples(path: str) -> list:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, list):
            return raw
        return raw.get("samples", [])
    except Exception as exc:
        print(f"  [WARN] Could not load {path}: {exc}")
        return []


def save_samples(path: str, samples: list) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"samples": samples}, f)


def merge_and_cap(existing_path: str, new_path: str, out_path: str, max_samples: int) -> int:
    existing = load_samples(existing_path) if existing_path != out_path else []
    new_data = load_samples(new_path)
    merged = existing + new_data
    if max_samples > 0 and len(merged) > max_samples:
        # Garde les plus récents (données des meilleures IA)
        merged = merged[-max_samples:]
    save_samples(out_path, merged)
    return len(merged)


def count_samples_fast(path: str) -> int:
    samples = load_samples(path)
    return len(samples)


# ──────────────────────────────────────────────────────────────────────────────
# Étape 1 : Self-play
# ──────────────────────────────────────────────────────────────────────────────

def run_selfplay(
    project_dir: Path,
    games: int,
    sims: int,
    workers: int,
    output_path: str,
    decks_path: str = "",
) -> bool:
    """Lance selfplayParallel.ts (workers Node.js en parallèle)."""
    cmd = [
        "node",
        "-r", "tsconfig-paths/register",
        "node_modules/ts-node/dist/bin.js",
        "--project", "scripts/tsconfig.json",
        "scripts/selfplayParallel.ts",
        "--games", str(games),
        "--sims", str(sims),
        "--workers", str(workers),
        "--output", output_path,
    ]
    if decks_path:
        cmd += ["--decks", decks_path]

    print(f"    Commande : {' '.join(cmd[:8])} ...")
    result = subprocess.run(cmd, cwd=str(project_dir))
    return result.returncode == 0


# ──────────────────────────────────────────────────────────────────────────────
# Étape 2 : Entraînement
# ──────────────────────────────────────────────────────────────────────────────

def run_training(
    project_dir: Path,
    data_path: str,
    output_dir: str,
    epochs: int,
    gpu: bool,
    large: bool,
    resume_path: str = "",
) -> bool:
    """Lance train.py."""
    script = Path(__file__).parent / "train.py"
    cmd = [
        sys.executable, str(script),
        "--data", data_path,
        "--output", output_dir,
        "--epochs", str(epochs),
        "--batch-size", "1024",
        "--accum-steps", "1",
        "--early-stop", "10",
        "--no-plot",
    ]
    if gpu:
        cmd.append("--gpu")
    if large:
        cmd.append("--large")
    if resume_path and os.path.exists(resume_path):
        cmd += ["--resume", resume_path]

    result = subprocess.run(cmd, cwd=str(project_dir))
    return result.returncode == 0


# ──────────────────────────────────────────────────────────────────────────────
# Étape 3 : Export ONNX
# ──────────────────────────────────────────────────────────────────────────────

def run_export(
    project_dir: Path,
    checkpoint: str,
    output_dir: str,
    large: bool,
) -> bool:
    """Lance export_onnx.py."""
    script = Path(__file__).parent / "export_onnx.py"
    if not script.exists():
        print("    [WARN] export_onnx.py introuvable — export ONNX ignoré")
        return True

    cmd = [sys.executable, str(script), "--checkpoint", checkpoint, "--output", output_dir]
    if large:
        cmd.append("--large")

    result = subprocess.run(cmd, cwd=str(project_dir))
    return result.returncode == 0


# ──────────────────────────────────────────────────────────────────────────────
# Rapport
# ──────────────────────────────────────────────────────────────────────────────

def print_header(args, project_dir: Path, output_dir: Path, data_dir: Path) -> None:
    print("=" * 72)
    print("  NARUTO MYTHOS TCG — Expert Iteration (AlphaZero-lite)")
    print("=" * 72)
    print(f"  Itérations    : {args.start_iter} → {args.iterations}")
    print(f"  Parties/iter  : {args.games_per_iter:,}")
    print(f"  Sims/action   : {args.sims}")
    print(f"  Workers       : {args.workers}")
    print(f"  Epochs/iter   : {args.epochs}")
    print(f"  GPU           : {args.gpu}")
    print(f"  Modèle large  : {args.large}")
    print(f"  Max samples   : {args.max_samples:,}" if args.max_samples else "  Max samples   : illimité")
    print(f"  Projet        : {project_dir}")
    print(f"  Modèles       : {output_dir}")
    print(f"  Données       : {data_dir}")
    print("=" * 72)


def print_summary(results: list, total_elapsed: float, output_dir: Path) -> None:
    print(f"\n{'=' * 72}")
    print("  EXPERT ITERATION TERMINÉ")
    print(f"{'=' * 72}")
    print(f"  {'Iter':>4}  {'Nouvelles':>10}  {'Total':>10}  {'Durée':>10}")
    print(f"  {'-'*4}  {'-'*10}  {'-'*10}  {'-'*10}")
    for r in results:
        print(
            f"  {r['iteration']:>4}  {r['new_samples']:>10,}  "
            f"{r['total_samples']:>10,}  {format_duration(r['elapsed']):>10}"
        )
    print(f"\n  Temps total    : {format_duration(total_elapsed)}")
    print(f"  Meilleur model : {output_dir / 'naruto_ai_best.pth'}")
    print(f"  ONNX           : {output_dir / 'naruto_ai.onnx'}")
    print("=" * 72)


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def parse_args():
    default_workers = max(1, (os.cpu_count() or 4) - 1)
    p = argparse.ArgumentParser(description="Expert Iteration pour Naruto Mythos TCG")
    p.add_argument("--iterations", type=int, default=6, help="Nombre de rounds EI (défaut: 6)")
    p.add_argument("--games-per-iter", type=int, default=2000, help="Parties de self-play par itération")
    p.add_argument("--sims", type=int, default=80, help="Simulations ISMCTS par action")
    p.add_argument("--workers", type=int, default=default_workers, help="Workers Node.js en parallèle")
    p.add_argument("--gpu", action="store_true", help="Entraîner sur GPU (CUDA)")
    p.add_argument("--large", action="store_true", help="Utiliser le grand modèle (NarutoValueNetLarge)")
    p.add_argument("--output", default="../public/models", help="Dossier de sortie des modèles")
    p.add_argument("--data-dir", default="../scripts", help="Dossier pour les données d'entraînement")
    p.add_argument("--epochs", type=int, default=25, help="Epochs d'entraînement par itération")
    p.add_argument("--max-samples", type=int, default=600000,
                   help="Taille max du pool de données (0 = illimité)")
    p.add_argument("--decks", default="", help="Chemin vers un fichier JSON de decks personnalisés")
    p.add_argument("--start-iter", type=int, default=1, help="Reprendre depuis cette itération")
    p.add_argument("--project-dir", default="",
                   help="Racine du projet Next.js (défaut: parent du dossier ai_training)")
    p.add_argument("--no-resume", action="store_true",
                   help="Ne pas reprendre depuis le dernier checkpoint")
    return p.parse_args()


def main():
    args = parse_args()

    # Chemins
    if args.project_dir:
        project_dir = Path(args.project_dir).resolve()
    else:
        project_dir = Path(__file__).parent.parent.resolve()

    output_dir = (Path(__file__).parent / args.output).resolve()
    data_dir = (Path(__file__).parent / args.data_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    # Fichier pool cumulé
    accumulated_path = str(data_dir / "expert_iteration_pool.json")
    best_model = str(output_dir / "naruto_ai_best.pth")

    print_header(args, project_dir, output_dir, data_dir)

    total_start = time.time()
    results = []

    for iteration in range(args.start_iter, args.iterations + 1):
        iter_start = time.time()

        print(f"\n{'=' * 72}")
        print(f"  ITÉRATION {iteration}/{args.iterations}")
        print(f"{'=' * 72}")

        # ── 1. Self-play ─────────────────────────────────────────────────────
        iter_data = str(data_dir / f"ei_iter_{iteration:02d}.json")
        print(f"\n  [1/3] Self-play ({args.games_per_iter:,} parties, {args.sims} sims, {args.workers} workers)...")
        t0 = time.time()

        ok = run_selfplay(
            project_dir=project_dir,
            games=args.games_per_iter,
            sims=args.sims,
            workers=args.workers,
            output_path=iter_data,
            decks_path=args.decks,
        )

        if not ok:
            print(f"  [ERREUR] Self-play échoué à l'itération {iteration}. Arrêt.")
            break

        new_count = count_samples_fast(iter_data)
        print(f"  => {new_count:,} nouveaux samples en {format_duration(time.time() - t0)}")

        # ── 2. Merge pool ────────────────────────────────────────────────────
        print(f"\n  [2/3] Fusion du pool de données...")

        existing_samples = load_samples(accumulated_path)
        new_samples = load_samples(iter_data)
        merged = existing_samples + new_samples

        if args.max_samples > 0 and len(merged) > args.max_samples:
            # Garde les données les plus récentes (IA la plus forte)
            dropped = len(merged) - args.max_samples
            merged = merged[-args.max_samples:]
            print(f"  => Suppression de {dropped:,} anciens samples (pool plein)")

        save_samples(accumulated_path, merged)
        total_count = len(merged)
        print(f"  => Pool total : {total_count:,} samples")

        # ── 3. Entraînement ──────────────────────────────────────────────────
        print(f"\n  [3/3] Entraînement ({args.epochs} epochs)...")
        t0 = time.time()

        # Sauvegarder le checkpoint de l'itération précédente
        prev_model = ""
        if not args.no_resume and os.path.exists(best_model):
            prev_model = best_model

        ok = run_training(
            project_dir=project_dir,
            data_path=accumulated_path,
            output_dir=str(output_dir),
            epochs=args.epochs,
            gpu=args.gpu,
            large=args.large,
            resume_path=prev_model,
        )

        if not ok:
            print(f"  [ERREUR] Entraînement échoué à l'itération {iteration}. Arrêt.")
            break

        print(f"  => Entraînement terminé en {format_duration(time.time() - t0)}")

        # Sauvegarder le modèle de cette itération
        if os.path.exists(best_model):
            iter_model = str(output_dir / f"naruto_ai_iter{iteration:02d}.pth")
            shutil.copy2(best_model, iter_model)
            print(f"  => Checkpoint sauvé : {iter_model}")

            # Export ONNX
            print(f"  => Export ONNX...")
            run_export(project_dir, best_model, str(output_dir), args.large)

        # ── Résumé itération ─────────────────────────────────────────────────
        iter_elapsed = time.time() - iter_start
        results.append({
            "iteration": iteration,
            "new_samples": new_count,
            "total_samples": total_count,
            "elapsed": iter_elapsed,
        })

        print(f"\n  Itération {iteration} terminée en {format_duration(iter_elapsed)}")
        print(f"  Temps total écoulé : {format_duration(time.time() - total_start)}")

        # Estimer le temps restant
        avg_iter = (time.time() - total_start) / (iteration - args.start_iter + 1)
        remaining_iters = args.iterations - iteration
        if remaining_iters > 0:
            eta = avg_iter * remaining_iters
            print(f"  ETA restant : ~{format_duration(eta)} ({remaining_iters} itérations)")

    print_summary(results, time.time() - total_start, output_dir)


if __name__ == "__main__":
    main()
