"""
NarutoValueNet: réseau de neurones pour évaluer les positions de jeu.

Architecture:
  - Entrée: vecteur de 200 features (issu de FeatureExtractor.ts)
  - Tronc partagé: 4 couches fully-connected avec LayerNorm + GELU
  - Tête de valeur: probabilité de victoire de player1 (sigmoid → [0,1])

Entraînement:
  - BCELoss (binary cross-entropy)
  - Adam + cosine LR scheduler
  - Data augmentation: flip player1/player2 pour doubler les données

Utilisation:
  python model.py --test    # Vérifie que le modèle tourne correctement
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple

FEATURE_DIM = 200  # Doit correspondre à FEATURE_DIM dans FeatureExtractor.ts


class NarutoValueNet(nn.Module):
    """
    Réseau de valeur pour Naruto Mythos TCG.
    Prédit la probabilité de victoire de player1 dans [0, 1].
    """

    def __init__(
        self,
        input_dim: int = FEATURE_DIM,
        hidden_dim: int = 512,
        dropout: float = 0.1,
    ):
        super().__init__()

        self.input_dim = input_dim
        self.hidden_dim = hidden_dim

        # ─── Input normalization ──────────────────────────────────────────────
        self.input_norm = nn.LayerNorm(input_dim)

        # ─── Shared trunk: 4 residual-style layers ───────────────────────────
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.norm1 = nn.LayerNorm(hidden_dim)

        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.norm2 = nn.LayerNorm(hidden_dim)

        self.fc3 = nn.Linear(hidden_dim, hidden_dim // 2)
        self.norm3 = nn.LayerNorm(hidden_dim // 2)

        self.fc4 = nn.Linear(hidden_dim // 2, hidden_dim // 4)
        self.norm4 = nn.LayerNorm(hidden_dim // 4)

        self.dropout = nn.Dropout(dropout)

        # ─── Value head: probability player1 wins ────────────────────────────
        self.value_head = nn.Sequential(
            nn.Linear(hidden_dim // 4, 64),
            nn.GELU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

        # ─── Weight initialization ────────────────────────────────────────────
        self._init_weights()

    def _init_weights(self):
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.kaiming_normal_(module.weight, nonlinearity='relu')
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch_size, FEATURE_DIM) — feature vectors
        Returns: (batch_size,) — win probabilities for player1 in [0, 1]
        """
        # Input normalization
        x = self.input_norm(x)

        # Layer 1
        x = F.gelu(self.norm1(self.fc1(x)))
        x = self.dropout(x)

        # Layer 2 (residual-like: skip connection not possible due to dim change)
        x = F.gelu(self.norm2(self.fc2(x)))
        x = self.dropout(x)

        # Layer 3
        x = F.gelu(self.norm3(self.fc3(x)))
        x = self.dropout(x)

        # Layer 4
        x = F.gelu(self.norm4(self.fc4(x)))

        # Value head
        value = self.value_head(x).squeeze(-1)  # (batch_size,)

        return value

    def predict(self, features: torch.Tensor) -> torch.Tensor:
        """Inference (no grad)."""
        with torch.no_grad():
            return self.forward(features)

    @staticmethod
    def count_parameters() -> int:
        model = NarutoValueNet()
        return sum(p.numel() for p in model.parameters() if p.requires_grad)


class NarutoValueNetLarge(NarutoValueNet):
    """
    Version plus grande pour le modèle Rikudo (maximum de puissance).
    ~3x plus de paramètres, entraînement plus long mais meilleure précision.
    """

    def __init__(self, input_dim: int = FEATURE_DIM):
        super().__init__(input_dim=input_dim, hidden_dim=1024, dropout=0.15)


if __name__ == '__main__':
    import sys

    print(f"FEATURE_DIM = {FEATURE_DIM}")
    print(f"Paramètres (modèle standard): {NarutoValueNet.count_parameters():,}")

    # Test forward pass
    model = NarutoValueNet()
    batch = torch.randn(16, FEATURE_DIM)
    output = model(batch)

    print(f"Input shape:  {batch.shape}")
    print(f"Output shape: {output.shape}")
    print(f"Output range: [{output.min().item():.3f}, {output.max().item():.3f}]")
    print("Modèle OK!")

    if '--test' in sys.argv:
        # Test avec GPU si disponible
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"\nDevice: {device}")
        model = model.to(device)
        batch = batch.to(device)
        out = model(batch)
        print(f"GPU test OK: {out.shape}")
