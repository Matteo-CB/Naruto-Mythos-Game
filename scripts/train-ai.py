#!/usr/bin/env python3
"""
Naruto Mythos TCG — AI Training Script

Fetches training data from MongoDB, trains a neural network to predict
win probability from 200-dimensional game state features, and exports
the model to ONNX format for use in the TypeScript AI evaluator.

Usage:
    pip install -r scripts/requirements.txt
    MONGODB_URI="mongodb+srv://..." python scripts/train-ai.py

Environment variables:
    MONGODB_URI  — MongoDB connection string (required)
    MODEL_DIR    — Output directory for model files (default: public/models)
    MIN_SAMPLES  — Minimum training samples required (default: 500)
    EPOCHS       — Max training epochs (default: 100)
    BATCH_SIZE   — Training batch size (default: 64)
    PATIENCE     — Early stopping patience (default: 10)
"""

import os
import sys
import json
import time
from datetime import datetime, timezone

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from pymongo import MongoClient
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, accuracy_score

# ─── Configuration ──────────────────────────────────────────────────────────────

FEATURE_DIM = 200
MONGODB_URI = os.environ.get("MONGODB_URI")
MODEL_DIR = os.environ.get("MODEL_DIR", os.path.join("public", "models"))
MIN_SAMPLES = int(os.environ.get("MIN_SAMPLES", "500"))
MAX_EPOCHS = int(os.environ.get("EPOCHS", "100"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "64"))
PATIENCE = int(os.environ.get("PATIENCE", "10"))
LEARNING_RATE = 0.001
SEED = 42

# ─── Model Definition ──────────────────────────────────────────────────────────

class NarutoValueNetwork(nn.Module):
    """
    Simple feedforward neural network for predicting win probability.
    Input: 200 features (normalized to [0, 1])
    Output: 1 value (sigmoid, win probability)

    Architecture: 200 -> 256 -> 128 -> 64 -> 1
    """

    def __init__(self, input_dim: int = FEATURE_DIM):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


# ─── Data Loading ───────────────────────────────────────────────────────────────

def fetch_training_data(uri: str) -> tuple[np.ndarray, np.ndarray]:
    """Fetch all training data from MongoDB and return (features, outcomes)."""
    print(f"Connecting to MongoDB...")
    client = MongoClient(uri)

    # Extract database name from the URI, or default to the first available
    db_name = uri.rsplit("/", 1)[-1].split("?")[0] if "/" in uri else None
    if db_name:
        db = client[db_name]
    else:
        db = client.get_default_database()

    collection = db["TrainingData"]
    count = collection.count_documents({})
    print(f"Found {count} training samples in database")

    if count < MIN_SAMPLES:
        print(f"ERROR: Not enough training data. Need at least {MIN_SAMPLES}, got {count}.")
        print("Play more ranked games to collect training data.")
        sys.exit(1)

    cursor = collection.find({}, {"features": 1, "outcome": 1, "_id": 0})

    features_list = []
    outcomes_list = []

    for doc in cursor:
        feat = doc["features"]
        # features is stored as a JSON array (list of floats)
        if isinstance(feat, list) and len(feat) == FEATURE_DIM:
            features_list.append(feat)
            outcomes_list.append(float(doc["outcome"]))
        else:
            # Skip malformed entries
            continue

    client.close()

    features = np.array(features_list, dtype=np.float32)
    outcomes = np.array(outcomes_list, dtype=np.float32)

    print(f"Loaded {len(features)} valid samples")
    print(f"  Win samples: {np.sum(outcomes > 0.5)}")
    print(f"  Loss samples: {np.sum(outcomes < 0.5)}")
    print(f"  Draw samples: {np.sum(outcomes == 0.5)}")

    return features, outcomes


# ─── Training ───────────────────────────────────────────────────────────────────

def train_model(
    features: np.ndarray,
    outcomes: np.ndarray,
) -> tuple[NarutoValueNetwork, dict]:
    """Train the neural network and return the model + training metadata."""

    torch.manual_seed(SEED)
    np.random.seed(SEED)

    # Split into train/val (80/20)
    X_train, X_val, y_train, y_val = train_test_split(
        features, outcomes, test_size=0.2, random_state=SEED, stratify=(outcomes > 0.5).astype(int)
    )

    print(f"\nTraining set: {len(X_train)} samples")
    print(f"Validation set: {len(X_val)} samples")

    # Convert to PyTorch tensors
    train_dataset = TensorDataset(
        torch.from_numpy(X_train),
        torch.from_numpy(y_train).unsqueeze(1),
    )
    val_dataset = TensorDataset(
        torch.from_numpy(X_val),
        torch.from_numpy(y_val).unsqueeze(1),
    )

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

    # Initialize model, loss, optimizer
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on: {device}")

    model = NarutoValueNetwork(FEATURE_DIM).to(device)
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    # Training loop with early stopping
    best_val_loss = float("inf")
    best_epoch = 0
    patience_counter = 0
    best_state_dict = None
    history = {"train_loss": [], "val_loss": [], "val_auc": [], "val_acc": []}

    print(f"\nStarting training (max {MAX_EPOCHS} epochs, patience={PATIENCE})...")
    print("-" * 70)

    for epoch in range(1, MAX_EPOCHS + 1):
        # ── Train ──
        model.train()
        train_loss_sum = 0.0
        train_batches = 0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            pred = model(X_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            optimizer.step()
            train_loss_sum += loss.item()
            train_batches += 1
        avg_train_loss = train_loss_sum / max(train_batches, 1)

        # ── Validate ──
        model.eval()
        val_preds = []
        val_labels = []
        val_loss_sum = 0.0
        val_batches = 0
        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                pred = model(X_batch)
                loss = criterion(pred, y_batch)
                val_loss_sum += loss.item()
                val_batches += 1
                val_preds.extend(pred.cpu().numpy().flatten().tolist())
                val_labels.extend(y_batch.cpu().numpy().flatten().tolist())

        avg_val_loss = val_loss_sum / max(val_batches, 1)

        # Compute metrics
        val_preds_np = np.array(val_preds)
        val_labels_np = np.array(val_labels)
        val_binary_preds = (val_preds_np > 0.5).astype(int)
        val_binary_labels = (val_labels_np > 0.5).astype(int)

        try:
            val_auc = roc_auc_score(val_binary_labels, val_preds_np)
        except ValueError:
            val_auc = 0.5  # If only one class present

        val_acc = accuracy_score(val_binary_labels, val_binary_preds)

        history["train_loss"].append(avg_train_loss)
        history["val_loss"].append(avg_val_loss)
        history["val_auc"].append(val_auc)
        history["val_acc"].append(val_acc)

        # Log every 5 epochs or on improvement
        improved = avg_val_loss < best_val_loss
        if epoch % 5 == 0 or epoch == 1 or improved:
            marker = " *" if improved else ""
            print(
                f"Epoch {epoch:3d} | "
                f"Train Loss: {avg_train_loss:.4f} | "
                f"Val Loss: {avg_val_loss:.4f} | "
                f"Val AUC: {val_auc:.4f} | "
                f"Val Acc: {val_acc:.4f}{marker}"
            )

        # Early stopping check
        if improved:
            best_val_loss = avg_val_loss
            best_epoch = epoch
            patience_counter = 0
            best_state_dict = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"\nEarly stopping at epoch {epoch} (best was epoch {best_epoch})")
                break

    print("-" * 70)

    # Restore best model
    if best_state_dict is not None:
        model.load_state_dict(best_state_dict)

    # Final validation metrics
    model.eval()
    final_preds = []
    final_labels = []
    with torch.no_grad():
        for X_batch, y_batch in val_loader:
            X_batch = X_batch.to(device)
            pred = model(X_batch)
            final_preds.extend(pred.cpu().numpy().flatten().tolist())
            final_labels.extend(y_batch.cpu().numpy().flatten().tolist())

    final_preds_np = np.array(final_preds)
    final_labels_np = np.array(final_labels)
    final_binary_preds = (final_preds_np > 0.5).astype(int)
    final_binary_labels = (final_labels_np > 0.5).astype(int)

    try:
        final_auc = roc_auc_score(final_binary_labels, final_preds_np)
    except ValueError:
        final_auc = 0.5

    final_acc = accuracy_score(final_binary_labels, final_binary_preds)

    print(f"\nBest model (epoch {best_epoch}):")
    print(f"  Validation Loss: {best_val_loss:.4f}")
    print(f"  Validation AUC:  {final_auc:.4f}")
    print(f"  Validation Acc:  {final_acc:.4f}")

    metadata = {
        "featureDim": FEATURE_DIM,
        "architecture": "200 -> 256 -> 128 -> 64 -> 1",
        "totalSamples": len(features),
        "trainSamples": len(X_train),
        "valSamples": len(X_val),
        "bestEpoch": best_epoch,
        "bestValLoss": round(best_val_loss, 6),
        "valAUC": round(final_auc, 4),
        "valAccuracy": round(final_acc, 4),
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "pytorchVersion": torch.__version__,
    }

    return model, metadata


# ─── Export ─────────────────────────────────────────────────────────────────────

def export_to_onnx(model: NarutoValueNetwork, output_dir: str, metadata: dict) -> None:
    """Export the trained model to ONNX format and save metadata."""
    os.makedirs(output_dir, exist_ok=True)

    model.eval()
    model_cpu = model.cpu()

    # Create dummy input for tracing
    dummy_input = torch.randn(1, FEATURE_DIM)

    onnx_path = os.path.join(output_dir, "naruto_ai.onnx")
    meta_path = os.path.join(output_dir, "naruto_ai_meta.json")

    # Export to ONNX
    torch.onnx.export(
        model_cpu,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=13,
        do_constant_folding=True,
        input_names=["features"],
        output_names=["win_probability"],
        dynamic_axes={
            "features": {0: "batch_size"},
            "win_probability": {0: "batch_size"},
        },
    )
    print(f"\nONNX model saved to: {onnx_path}")

    # Verify ONNX model
    try:
        import onnx
        onnx_model = onnx.load(onnx_path)
        onnx.checker.check_model(onnx_model)
        print("ONNX model verification: PASSED")
    except Exception as e:
        print(f"ONNX model verification warning: {e}")

    # Verify with ONNX Runtime
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(onnx_path)
        test_input = np.random.randn(1, FEATURE_DIM).astype(np.float32)
        result = session.run(None, {"features": test_input})
        print(f"ONNX Runtime test: output shape={result[0].shape}, value={result[0][0][0]:.4f}")
    except Exception as e:
        print(f"ONNX Runtime test warning: {e}")

    # Save metadata
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to: {meta_path}")


# ─── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  Naruto Mythos TCG — AI Value Network Training")
    print("=" * 70)

    if not MONGODB_URI:
        print("\nERROR: MONGODB_URI environment variable is not set.")
        print("Usage: MONGODB_URI='mongodb+srv://...' python scripts/train-ai.py")
        sys.exit(1)

    start_time = time.time()

    # 1. Fetch data
    features, outcomes = fetch_training_data(MONGODB_URI)

    # 2. Train model
    model, metadata = train_model(features, outcomes)

    # 3. Export to ONNX
    export_to_onnx(model, MODEL_DIR, metadata)

    elapsed = time.time() - start_time
    print(f"\nTotal time: {elapsed:.1f}s")
    print("=" * 70)
    print("Training complete. Deploy public/models/naruto_ai.onnx to production.")
    print("=" * 70)


if __name__ == "__main__":
    main()
