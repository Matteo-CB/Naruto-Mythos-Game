"""
High-performance training script for Naruto Mythos value network.

Usage examples:
  python train.py --data ../scripts/training_data.json --gpu --preset fast2h
  python train.py --data ../scripts/training_data.json --gpu --preset long24h
"""

import argparse
import json
import os
import random
from contextlib import nullcontext
from pathlib import Path
from typing import List, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import roc_auc_score
from torch.utils.data import DataLoader, Dataset, random_split
from tqdm import tqdm

from model import FEATURE_DIM, NarutoValueNet, NarutoValueNetLarge


class NarutoDataset(Dataset):
    def __init__(self, data_path: str, augment: bool = True):
        print(f"Loading data from {data_path} ...")
        with open(data_path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        self.features: List[np.ndarray] = []
        self.labels: List[float] = []
        self.invalid_values_repaired = 0
        self.out_of_range_values_clipped = 0
        self.invalid_labels_repaired = 0

        samples = raw if isinstance(raw, list) else raw.get("samples", [])

        for sample in samples:
            feats = self._sanitize_features(sample.get("features", []))
            outcome = self._sanitize_label(sample.get("outcome", 0.5))

            if len(feats) < FEATURE_DIM:
                feats = np.pad(feats, (0, FEATURE_DIM - len(feats)))
            elif len(feats) > FEATURE_DIM:
                feats = feats[:FEATURE_DIM]

            self.features.append(feats)
            self.labels.append(outcome)

            if augment and "features_flipped" in sample:
                feats_flipped = self._sanitize_features(sample.get("features_flipped", []))
                if len(feats_flipped) < FEATURE_DIM:
                    feats_flipped = np.pad(feats_flipped, (0, FEATURE_DIM - len(feats_flipped)))
                elif len(feats_flipped) > FEATURE_DIM:
                    feats_flipped = feats_flipped[:FEATURE_DIM]
                self.features.append(feats_flipped)
                self.labels.append(1.0 - outcome)

        print(f"  {len(self.features):,} samples loaded (augment={augment})")
        if (
            self.invalid_values_repaired > 0
            or self.out_of_range_values_clipped > 0
            or self.invalid_labels_repaired > 0
        ):
            print(
                "  Cleanup: "
                f"{self.invalid_values_repaired:,} invalid values fixed, "
                f"{self.out_of_range_values_clipped:,} clipped values, "
                f"{self.invalid_labels_repaired:,} labels repaired"
            )

        wins = sum(1 for y in self.labels if y > 0.5)
        losses = len(self.labels) - wins
        print(f"  Distribution: {wins} p1 wins / {losses} p2 wins")

    def _sanitize_features(self, values) -> np.ndarray:
        feats = np.array(values, dtype=np.float32)

        invalid_mask = ~np.isfinite(feats)
        invalid_count = int(invalid_mask.sum())
        if invalid_count:
            self.invalid_values_repaired += invalid_count
            feats = np.nan_to_num(feats, nan=0.0, posinf=1.0, neginf=0.0)

        out_of_range_mask = (feats < 0.0) | (feats > 1.0)
        out_of_range_count = int(out_of_range_mask.sum())
        if out_of_range_count:
            self.out_of_range_values_clipped += out_of_range_count
            feats = np.clip(feats, 0.0, 1.0)

        return feats

    def _sanitize_label(self, value) -> float:
        try:
            label = float(value)
        except (TypeError, ValueError):
            self.invalid_labels_repaired += 1
            return 0.5

        if not np.isfinite(label):
            self.invalid_labels_repaired += 1
            return 0.5

        if label < 0.0 or label > 1.0:
            self.invalid_labels_repaired += 1
            return min(max(label, 0.0), 1.0)

        return label

    def __len__(self) -> int:
        return len(self.features)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return (
            torch.from_numpy(self.features[idx]),
            torch.tensor(self.labels[idx], dtype=torch.float32),
        )


class Trainer:
    def __init__(self, args):
        self.args = args
        self.device = self._setup_device()
        self.model = self._build_model()
        self.use_amp = self.device.type == "cuda" and self.args.amp
        self.accum_steps = max(1, self.args.accum_steps)
        try:
            self.scaler = torch.amp.GradScaler("cuda", enabled=self.use_amp)
        except Exception:
            self.scaler = torch.cuda.amp.GradScaler(enabled=self.use_amp)
        self.history = {
            "train_loss": [],
            "val_loss": [],
            "train_acc": [],
            "val_acc": [],
            "val_auc": [],
        }

    def _setup_device(self) -> torch.device:
        if self.args.gpu and torch.cuda.is_available():
            device = torch.device("cuda")
            print(f"GPU: {torch.cuda.get_device_name(0)}")
            print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
            torch.backends.cudnn.benchmark = True
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            if hasattr(torch, "set_float32_matmul_precision"):
                torch.set_float32_matmul_precision("high")
        else:
            device = torch.device("cpu")
            if self.args.gpu:
                print("GPU requested but CUDA is unavailable - using CPU")
            else:
                print("CPU mode")
        return device

    def _build_model(self):
        if self.args.large:
            model = NarutoValueNetLarge(input_dim=FEATURE_DIM)
            print(f"Model LARGE: {sum(p.numel() for p in model.parameters()):,} params")
        else:
            model = NarutoValueNet(input_dim=FEATURE_DIM)
            print(f"Model standard: {sum(p.numel() for p in model.parameters()):,} params")

        if self.args.resume and os.path.exists(self.args.resume):
            checkpoint = torch.load(self.args.resume, map_location="cpu")
            model.load_state_dict(checkpoint["model_state"])
            print(f"Resumed from: {self.args.resume}")

        model = model.to(self.device)

        if self.args.compile and hasattr(torch, "compile"):
            try:
                eager_model = model
                compiled_model = torch.compile(eager_model)
                if self.device.type == "cuda":
                    with torch.no_grad():
                        warmup = torch.zeros((2, FEATURE_DIM), device=self.device, dtype=torch.float32)
                        _ = compiled_model(warmup)
                model = compiled_model
                print("torch.compile enabled")
            except Exception as err:
                model = model.to(self.device)
                print(f"torch.compile unavailable ({err}) - using eager mode")

        return model

    def _autocast_context(self):
        if not self.use_amp:
            return nullcontext()

        try:
            return torch.amp.autocast("cuda", dtype=torch.float16)
        except Exception:
            return torch.cuda.amp.autocast(dtype=torch.float16)

    def _make_loaders(self, train_set, val_set):
        num_workers = max(0, self.args.num_workers)
        loader_kwargs = {
            "num_workers": num_workers,
            "pin_memory": self.device.type == "cuda",
        }
        if num_workers > 0:
            loader_kwargs["persistent_workers"] = True
            loader_kwargs["prefetch_factor"] = max(2, self.args.prefetch_factor)

        train_loader = DataLoader(
            train_set,
            batch_size=self.args.batch_size,
            shuffle=True,
            **loader_kwargs,
        )
        val_loader = DataLoader(
            val_set,
            batch_size=self.args.batch_size * 4,
            shuffle=False,
            **loader_kwargs,
        )
        return train_loader, val_loader, num_workers

    def train(self):
        dataset = NarutoDataset(self.args.data, augment=not self.args.no_augment)
        n_val = max(1, int(len(dataset) * 0.1))
        n_train = len(dataset) - n_val
        train_set, val_set = random_split(
            dataset,
            [n_train, n_val],
            generator=torch.Generator().manual_seed(self.args.seed),
        )

        train_loader, val_loader, workers = self._make_loaders(train_set, val_set)

        print(f"\nTrain: {n_train:,} | Val: {n_val:,}")
        print(
            f"Batch={self.args.batch_size} Epochs={self.args.epochs} "
            f"Workers={workers} AMP={self.use_amp} Accum={self.accum_steps}"
        )

        criterion = nn.BCELoss()
        optimizer = optim.AdamW(
            self.model.parameters(),
            lr=self.args.lr,
            weight_decay=1e-4,
        )
        scheduler = optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=self.args.epochs, eta_min=1e-6
        )

        best_val_auc = 0.0
        no_improve_epochs = 0
        output_dir = Path(self.args.output)
        output_dir.mkdir(parents=True, exist_ok=True)

        print("\nTraining start")
        print("=" * 60)

        for epoch in range(1, self.args.epochs + 1):
            self.model.train()
            train_loss = 0.0
            train_correct = 0
            train_total = 0
            optimizer.zero_grad(set_to_none=True)

            for step, (features, labels) in enumerate(
                tqdm(train_loader, desc=f"Epoch {epoch}/{self.args.epochs}", leave=False)
            ):
                features = features.to(self.device, non_blocking=True)
                labels = labels.to(self.device, non_blocking=True)

                autocast_ctx = self._autocast_context()
                with autocast_ctx:
                    predictions = self.model(features)
                # BCELoss is not autocast-safe: compute it explicitly in fp32.
                loss = criterion(predictions.float(), labels.float())

                scaled_loss = loss / self.accum_steps
                if self.use_amp:
                    self.scaler.scale(scaled_loss).backward()
                else:
                    scaled_loss.backward()

                should_step = ((step + 1) % self.accum_steps == 0) or (
                    (step + 1) == len(train_loader)
                )
                if should_step:
                    if self.use_amp:
                        self.scaler.unscale_(optimizer)
                        nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                        self.scaler.step(optimizer)
                        self.scaler.update()
                    else:
                        nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                        optimizer.step()
                    optimizer.zero_grad(set_to_none=True)

                train_loss += loss.item() * len(labels)
                train_correct += ((predictions.detach() > 0.5) == (labels > 0.5)).sum().item()
                train_total += len(labels)

            scheduler.step()
            avg_train_loss = train_loss / max(1, train_total)
            avg_train_acc = train_correct / max(1, train_total)

            val_loss, val_acc, val_auc = self._validate(val_loader, criterion)

            self.history["train_loss"].append(avg_train_loss)
            self.history["val_loss"].append(val_loss)
            self.history["train_acc"].append(avg_train_acc)
            self.history["val_acc"].append(val_acc)
            self.history["val_auc"].append(val_auc)

            lr = optimizer.param_groups[0]["lr"]
            print(
                f"Epoch {epoch:3d}/{self.args.epochs} | "
                f"loss train={avg_train_loss:.4f} val={val_loss:.4f} | "
                f"acc train={avg_train_acc:.3f} val={val_acc:.3f} | "
                f"auc={val_auc:.3f} | lr={lr:.2e}"
            )

            if val_auc > best_val_auc + 1e-4:
                best_val_auc = val_auc
                no_improve_epochs = 0
                best_path = output_dir / "naruto_ai_best.pth"
                torch.save(
                    {
                        "epoch": epoch,
                        "model_state": self.model.state_dict(),
                        "val_loss": val_loss,
                        "val_auc": val_auc,
                        "args": vars(self.args),
                    },
                    best_path,
                )
                print(f"  -> New best saved (AUC={val_auc:.4f})")
            else:
                no_improve_epochs += 1

            if epoch % 10 == 0:
                checkpoint_path = output_dir / f"checkpoint_epoch{epoch:03d}.pth"
                torch.save(
                    {
                        "epoch": epoch,
                        "model_state": self.model.state_dict(),
                        "optimizer_state": optimizer.state_dict(),
                        "val_loss": val_loss,
                        "val_auc": val_auc,
                    },
                    checkpoint_path,
                )

            if self.args.early_stop > 0 and no_improve_epochs >= self.args.early_stop:
                print(
                    f"Early stopping at epoch {epoch} "
                    f"(no AUC improvement for {no_improve_epochs} epochs)"
                )
                break

        print("\n" + "=" * 60)
        print(f"Training finished. Best AUC={best_val_auc:.4f}")
        print(f"Model saved to: {output_dir}/naruto_ai_best.pth")

        if not self.args.no_plot:
            self._plot_history(output_dir)

    def _validate(self, loader: DataLoader, criterion: nn.Module) -> Tuple[float, float, float]:
        self.model.eval()
        total_loss = 0.0
        total_correct = 0
        total_samples = 0
        all_preds: List[float] = []
        all_labels: List[float] = []

        with torch.no_grad():
            for features, labels in loader:
                features = features.to(self.device, non_blocking=True)
                labels = labels.to(self.device, non_blocking=True)

                autocast_ctx = self._autocast_context()
                with autocast_ctx:
                    predictions = self.model(features)
                # BCELoss is not autocast-safe: compute it explicitly in fp32.
                loss = criterion(predictions.float(), labels.float())

                total_loss += loss.item() * len(labels)
                total_correct += ((predictions > 0.5) == (labels > 0.5)).sum().item()
                total_samples += len(labels)

                all_preds.extend(predictions.detach().cpu().numpy().tolist())
                all_labels.extend(labels.detach().cpu().numpy().tolist())

        avg_loss = total_loss / max(1, total_samples)
        accuracy = total_correct / max(1, total_samples)

        try:
            auc = roc_auc_score(all_labels, all_preds)
        except Exception:
            auc = 0.5

        return avg_loss, accuracy, auc

    def _plot_history(self, output_dir: Path):
        try:
            import matplotlib.pyplot as plt
        except Exception:
            print("matplotlib not available - skipping plots")
            return

        fig, axes = plt.subplots(1, 2, figsize=(12, 4))
        epochs = range(1, len(self.history["train_loss"]) + 1)

        axes[0].plot(epochs, self.history["train_loss"], label="Train Loss")
        axes[0].plot(epochs, self.history["val_loss"], label="Val Loss")
        axes[0].set_title("Loss")
        axes[0].set_xlabel("Epoch")
        axes[0].legend()
        axes[0].grid(True)

        axes[1].plot(epochs, self.history["train_acc"], label="Train Acc")
        axes[1].plot(epochs, self.history["val_acc"], label="Val Acc")
        axes[1].plot(epochs, self.history["val_auc"], label="Val AUC")
        axes[1].set_title("Accuracy / AUC")
        axes[1].set_xlabel("Epoch")
        axes[1].legend()
        axes[1].grid(True)

        plt.tight_layout()
        plot_path = output_dir / "training_history.png"
        plt.savefig(plot_path, dpi=150)
        plt.close()
        print(f"Plots saved: {plot_path}")


def parse_args():
    default_workers = max(0, min(8, (os.cpu_count() or 4) - 1))

    parser = argparse.ArgumentParser(description="Naruto Mythos AI training")
    parser.add_argument("--data", required=True, help="Path to self-play JSON")
    parser.add_argument("--output", default="../public/models/", help="Output directory")
    parser.add_argument("--epochs", type=int, default=50, help="Epoch count")
    parser.add_argument("--batch-size", type=int, default=512, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-3, help="Initial learning rate")
    parser.add_argument("--num-workers", type=int, default=default_workers, help="DataLoader workers")
    parser.add_argument("--prefetch-factor", type=int, default=2, help="DataLoader prefetch factor")
    parser.add_argument("--accum-steps", type=int, default=1, help="Gradient accumulation steps")
    parser.add_argument("--early-stop", type=int, default=12, help="AUC early stop patience (0 disables)")
    parser.add_argument("--gpu", action="store_true", help="Use CUDA GPU")
    parser.add_argument("--large", action="store_true", help="Use large model")
    parser.add_argument("--compile", action="store_true", help="Enable torch.compile")
    parser.add_argument("--no-compile", action="store_true", help="Disable torch.compile")
    parser.add_argument("--amp", dest="amp", action="store_true", help="Enable AMP mixed precision")
    parser.add_argument("--no-amp", dest="amp", action="store_false", help="Disable AMP mixed precision")
    parser.add_argument("--resume", type=str, help="Resume from checkpoint")
    parser.add_argument("--preset", choices=["fast2h", "long24h"], help="Training preset")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--no-augment", action="store_true", help="Disable flipped augmentation")
    parser.add_argument("--no-plot", action="store_true", help="Disable plot generation")
    parser.set_defaults(amp=True)
    return parser.parse_args()


def apply_preset(args):
    if args.preset == "fast2h":
        args.epochs = 40
        args.batch_size = 1024
        args.lr = 8e-4
        args.accum_steps = 1
        args.num_workers = max(args.num_workers, 4)
        args.early_stop = 8
        args.large = False
    elif args.preset == "long24h":
        args.epochs = 140
        args.batch_size = 1024
        args.lr = 7e-4
        args.accum_steps = max(args.accum_steps, 2)
        args.num_workers = max(args.num_workers, 6)
        args.early_stop = 18
        args.large = True
        args.compile = True

    if args.no_compile:
        args.compile = False


def set_global_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


if __name__ == "__main__":
    args = parse_args()
    apply_preset(args)
    set_global_seed(args.seed)

    print("=" * 60)
    print("  NARUTO MYTHOS TCG - Neural network training")
    print("=" * 60)
    print(f"  Data:      {args.data}")
    print(f"  Output:    {args.output}")
    print(f"  Model:     {'LARGE' if args.large else 'Standard'}")
    print(f"  Preset:    {args.preset or 'custom'}")
    print(f"  Epochs:    {args.epochs}")
    print(f"  Batch:     {args.batch_size}")
    print(f"  Workers:   {args.num_workers}")
    print(f"  Accum:     {args.accum_steps}")
    print(f"  AMP:       {args.amp}")
    print(f"  Compile:   {args.compile}")
    print(f"  GPU:       {args.gpu}")
    print("=" * 60)
    print()

    trainer = Trainer(args)
    trainer.train()
