"""
PPO Self-Play Trainer pour Naruto Mythos TCG.
=============================================

Architecture :
  - Actor-Critic partagé (même tronc que NarutoValueNet)
  - Tête de politique (policy head) : probabilités sur les actions valides
  - Tête de valeur (value head) : estimation de la valeur d'état (déjà entraînée)
  - Self-play : l'IA joue contre elle-même, les deux côtés apprennent

Avantages vs supervisé :
  - Apprend des stratégies que le selfplay classique ne génère pas
  - Reward en cours de partie (points de mission intermédiaires)
  - Peut charger le modèle supervisé comme point de départ (--pretrained)

Limitations importantes :
  - Ce trainer utilise un ENVIRONNEMENT PYTHON SIMPLIFIÉ (sans effets de carte)
  - Il apprend la stratégie générale : quelle mission cibler, quand se cacher,
    gérer le chakra, le token Edge — mais pas les combos de cartes spécifiques
  - Pour les effets de carte complets, utilise expert_iteration.py

Usage :
  # Fine-tuner le modèle supervisé déjà entraîné :
  python ppo_trainer.py --pretrained ../public/models/naruto_ai_best.pth --gpu --large

  # Entraîner from scratch :
  python ppo_trainer.py --gpu --large --episodes 50000

  # Entraînement court pour tester :
  python ppo_trainer.py --episodes 5000 --envs 8 --gpu
"""

import argparse
import os
import random
import time
from collections import deque
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical

# Compatible avec model.py
FEATURE_DIM = 200

# ──────────────────────────────────────────────────────────────────────────────
# Environnement de jeu simplifié (Python)
# ──────────────────────────────────────────────────────────────────────────────

MAX_ACTIONS = 64  # Taille fixe de l'espace d'action (avec masquage)

# Types d'actions (indices dans le vecteur d'action)
# 0     : PASS
# 1-4   : PLAY_FACE_VISIBLE sur mission 0/1/2/3 (carte 0 de la main)
# 5-8   : PLAY_FACE_VISIBLE sur mission 0/1/2/3 (carte 1)
# ...   : jusqu'à 10 cartes en main × 4 missions = 40 actions face-visible
# 41-44 : PLAY_FACE_DOWN sur mission 0/1/2/3 (carte 0)
# ...   : jusqu'à 10 cartes × 4 missions = 40 actions face-cachée
# On compacte : 1 + 10*4 + 10*4 = 81 → on limite à 64 pour la démo


class Card:
    """Carte simplifiée sans effets."""
    def __init__(self, chakra: int, power: int, group: int = 0):
        self.chakra = chakra
        self.power = power
        self.group = group  # 0=Leaf, 1=Sand, 2=Sound, 3=Akatsuki
        self.name_id = random.randint(0, 49)  # ID unique pour la règle "1 par mission"


class SimpleDeck:
    """Deck de 30 cartes générées aléatoirement."""

    @staticmethod
    def random() -> List[Card]:
        cards = []
        for _ in range(30):
            chakra = random.randint(1, 9)
            power = random.randint(1, 7)
            group = random.randint(0, 3)
            cards.append(Card(chakra, power, group))
        random.shuffle(cards)
        return cards


class NarutoSimpleEnv:
    """
    Environnement Naruto Mythos TCG simplifié pour PPO.

    Règles implémentées :
      - 4 tours, 4 missions (rangs D/C/B/A)
      - Chakra : 5 + 1 par personnage en jeu (caché inclus)
      - Phase d'action : jouer face-visible (coût), face-cachée (1 chakra), passer
      - Phase de mission : compare power, gagne mission points
      - Pas d'effets de carte (MAIN/AMBUSH/SCORE/UPGRADE non implémentés)
      - Token Edge : premier à passer le garde, brise les égalités

    Observation : vecteur de 200 features (compatible FEATURE_DIM)
    Action : entier dans [0, MAX_ACTIONS)
    """

    RANK_BONUS = {0: 1, 1: 2, 2: 3, 3: 4}  # D=1, C=2, B=3, A=4

    def __init__(self):
        self.reset()

    def reset(self) -> np.ndarray:
        # Decks
        self.decks = [SimpleDeck.random(), SimpleDeck.random()]
        self.hands = [[], []]
        self.discard = [[], []]
        self.chakra = [0, 0]
        self.passed = [False, False]
        self.edge = 0  # joueur avec le Edge token
        self.turn = 1
        self.phase = "start"  # start → action → mission → end
        self.mission_points = [0, 0]
        self.missions_base = []  # points de base par mission
        self.missions = []  # 4 missions : list of {p0: [], p1: []} (personnages)
        self.active_player = 0
        self.done = False
        self.winner = None

        # Tirage initial (5 cartes chacun)
        for p in range(2):
            self._draw(p, 5)

        self._start_phase()
        return self._observe(0)

    def _draw(self, player: int, n: int = 1):
        for _ in range(n):
            if self.decks[player]:
                self.hands[player].append(self.decks[player].pop())

    def _start_phase(self):
        """Phase de début : révéler mission, donner chakra, piocher."""
        # Révéler une mission
        mission_idx = len(self.missions)
        base_pts = random.randint(1, 3)
        self.missions.append({"p0": [], "p1": []})
        self.missions_base.append(base_pts)

        # Chakra : 5 + 1 par personnage en jeu (caché ou non)
        for p in range(2):
            chars_in_play = len(self.missions[0]["p0" if p == 0 else "p1"])
            for m in self.missions:
                chars_in_play += len(m["p0" if p == 0 else "p1"])
            self.chakra[p] += 5 + chars_in_play
            self._draw(p, 2)

        self.passed = [False, False]
        self.phase = "action"
        self.active_player = self.edge  # le détenteur du Edge joue en premier

    def _get_valid_actions(self, player: int) -> List[int]:
        if self.passed[player]:
            return []

        valid = [0]  # PASS toujours valide
        hand = self.hands[player]
        mission_count = len(self.missions)

        for card_idx, card in enumerate(hand[:8]):
            # Face-visible : sur chaque mission (si on peut payer)
            if self.chakra[player] >= card.chakra:
                for m_idx in range(mission_count):
                    action = 1 + card_idx * 4 + m_idx
                    if action < MAX_ACTIONS:
                        valid.append(action)

            # Face-cachée : 1 chakra sur chaque mission
            if self.chakra[player] >= 1:
                for m_idx in range(mission_count):
                    action = 33 + card_idx * 4 + m_idx
                    if action < MAX_ACTIONS:
                        valid.append(action)

        return list(set(valid))

    def _decode_action(self, action: int, player: int) -> Tuple[str, int, int, bool]:
        """(type, card_idx, mission_idx, hidden)"""
        if action == 0:
            return ("pass", -1, -1, False)
        if action < 33:
            card_idx = (action - 1) // 4
            m_idx = (action - 1) % 4
            return ("play", card_idx, m_idx, False)
        card_idx = (action - 33) // 4
        m_idx = (action - 33) % 4
        return ("play", card_idx, m_idx, True)

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, dict]:
        """Applique l'action du joueur actif."""
        player = self.active_player
        reward = 0.0

        valid = self._get_valid_actions(player)
        if action not in valid:
            # Action invalide → pénalité légère + PASS forcé
            action = 0
            reward -= 0.05

        kind, card_idx, m_idx, hidden = self._decode_action(action, player)

        if kind == "pass":
            self.passed[player] = True
            if not any(self.passed):
                # Premier à passer → gagne le Edge token
                self.edge = player

        elif kind == "play":
            # Vérifier que la carte et la mission existent
            hand = self.hands[player]
            if card_idx < len(hand) and m_idx < len(self.missions):
                card = hand[card_idx]
                cost = 1 if hidden else card.chakra
                if self.chakra[player] >= cost:
                    self.chakra[player] -= cost
                    hand.pop(card_idx)
                    key = "p0" if player == 0 else "p1"
                    self.missions[m_idx][key].append({
                        "power": 0 if hidden else card.power,
                        "hidden": hidden,
                        "card": card,
                    })

        # Changer de joueur actif
        other = 1 - player
        if self.passed[other] or not self._get_valid_actions(other):
            # L'autre a passé ou n'a plus d'actions → continuer avec le joueur courant
            if self.passed[player] or not self._get_valid_actions(player):
                # Les deux ont passé → phase de mission
                reward += self._mission_phase()
                if self.turn >= 4:
                    self.done = True
                    self._end_game()
                else:
                    self.turn += 1
                    self._end_turn_phase()
                    self._start_phase()
        else:
            self.active_player = other

        obs = self._observe(0)  # observation depuis la perspective de player1
        return obs, reward, self.done, {"winner": self.winner}

    def _mission_phase(self) -> float:
        """Résolution des missions. Retourne la récompense différentielle."""
        delta = 0.0
        for m_idx, mission in enumerate(self.missions):
            rank_bonus = self.RANK_BONUS.get(m_idx, 1)
            base = self.missions_base[m_idx] if m_idx < len(self.missions_base) else 1
            total_pts = base + rank_bonus

            p0_power = sum(c["power"] for c in mission["p0"] if not c["hidden"])
            p1_power = sum(c["power"] for c in mission["p1"] if not c["hidden"])

            if p0_power == 0 and p1_power == 0:
                continue  # personne ne gagne si power=0

            if p0_power > p1_power or (p0_power == p1_power and self.edge == 0):
                self.mission_points[0] += total_pts
                delta += total_pts
            elif p1_power > p0_power or (p0_power == p1_power and self.edge == 1):
                self.mission_points[1] += total_pts
                delta -= total_pts

        return delta * 0.05  # reward normalisé

    def _end_turn_phase(self):
        """Fin de tour : vider le chakra, enlever les tokens de puissance."""
        self.chakra = [0, 0]

    def _end_game(self):
        pts0, pts1 = self.mission_points
        if pts0 > pts1:
            self.winner = 0
        elif pts1 > pts0:
            self.winner = 1
        else:
            self.winner = self.edge  # Edge brise l'égalité

    def _observe(self, from_player: int = 0) -> np.ndarray:
        """Vecteur de 200 features (compatible FEATURE_DIM)."""
        f = np.zeros(FEATURE_DIM, dtype=np.float32)
        idx = 0

        other = 1 - from_player
        my_hand = self.hands[from_player]
        opp_hand = self.hands[other]

        # [0..7] Contexte global
        f[idx] = self.turn / 4; idx += 1
        for t in range(1, 5):
            f[idx] = 1.0 if self.turn == t else 0.0; idx += 1
        f[idx] = 1.0; idx += 1  # phase action (simplifié, toujours action ici)
        f[idx] = 1.0 if from_player == self.active_player else 0.0; idx += 1
        f[idx] = 1.0 if self.edge == from_player else 0.0; idx += 1

        # [8..14] Mon état
        f[idx] = min(self.chakra[from_player] / 20, 1.0); idx += 1
        f[idx] = min(self.mission_points[from_player] / 20, 1.0); idx += 1
        f[idx] = min(len(self.decks[from_player]) / 30, 1.0); idx += 1
        f[idx] = min(len(my_hand) / 10, 1.0); idx += 1
        f[idx] = min(len(self.discard[from_player]) / 30, 1.0); idx += 1
        f[idx] = 1.0 if self.passed[from_player] else 0.0; idx += 1
        my_chars = sum(len(m["p0" if from_player == 0 else "p1"]) for m in self.missions)
        f[idx] = min(my_chars / 12, 1.0); idx += 1

        # [15..21] État adversaire
        f[idx] = min(self.chakra[other] / 20, 1.0); idx += 1
        f[idx] = min(self.mission_points[other] / 20, 1.0); idx += 1
        f[idx] = min(len(self.decks[other]) / 30, 1.0); idx += 1
        f[idx] = min(len(opp_hand) / 10, 1.0); idx += 1
        f[idx] = min(len(self.discard[other]) / 30, 1.0); idx += 1
        f[idx] = 1.0 if self.passed[other] else 0.0; idx += 1
        opp_chars = sum(len(m["p1" if from_player == 0 else "p0"]) for m in self.missions)
        f[idx] = min(opp_chars / 12, 1.0); idx += 1

        # [22..85] Missions (4 × 16)
        for m_idx in range(4):
            if m_idx >= len(self.missions):
                idx += 16
                continue
            mission = self.missions[m_idx]
            rank_bonus = self.RANK_BONUS.get(m_idx, 1)
            base = self.missions_base[m_idx] if m_idx < len(self.missions_base) else 1

            # Rank one-hot (4)
            for r in range(4):
                f[idx] = 1.0 if r == m_idx else 0.0; idx += 1

            # Points (2)
            f[idx] = min(base / 5, 1.0); idx += 1
            f[idx] = rank_bonus / 4; idx += 1

            my_key = "p0" if from_player == 0 else "p1"
            opp_key = "p1" if from_player == 0 else "p0"
            my_side = mission[my_key]
            opp_side = mission[opp_key]

            my_power = sum(c["power"] for c in my_side if not c["hidden"])
            my_hidden = sum(1 for c in my_side if c["hidden"])
            opp_power = sum(c["power"] for c in opp_side if not c["hidden"])
            opp_hidden = sum(1 for c in opp_side if c["hidden"])

            # Mon côté (5)
            f[idx] = min(len(my_side) / 5, 1.0); idx += 1
            f[idx] = min(my_hidden / 5, 1.0); idx += 1
            f[idx] = min(my_power / 20, 1.0); idx += 1
            f[idx] = 0.0; idx += 1  # power tokens
            f[idx] = 0.0; idx += 1  # SCORE effect

            # Côté adverse (5)
            f[idx] = min(len(opp_side) / 5, 1.0); idx += 1
            f[idx] = min(opp_hidden / 5, 1.0); idx += 1
            f[idx] = min(opp_power / 20, 1.0); idx += 1
            f[idx] = 0.0; idx += 1
            f[idx] = 0.0; idx += 1

        # [86..176] Main (7 cartes × 13)
        for h in range(7):
            if h >= len(my_hand):
                idx += 13
                continue
            card = my_hand[h]
            f[idx] = 1.0; idx += 1
            f[idx] = min(card.chakra / 10, 1.0); idx += 1
            f[idx] = min(card.power / 10, 1.0); idx += 1
            f[idx] = 0.0; idx += 1  # MAIN
            f[idx] = 0.0; idx += 1  # AMBUSH
            f[idx] = 0.0; idx += 1  # SCORE
            f[idx] = 0.0; idx += 1  # UPGRADE
            f[idx] = 0.0; idx += 1  # CHAKRA+
            f[idx] = 0.0; idx += 1  # POWERUP
            f[idx] = 1.0 if card.group == 0 else 0.0; idx += 1  # Leaf
            f[idx] = 1.0 if card.group == 1 else 0.0; idx += 1  # Sand
            f[idx] = 1.0 if card.group == 2 else 0.0; idx += 1  # Sound
            f[idx] = 1.0 if card.group == 3 else 0.0; idx += 1  # Akatsuki

        # [177..199] Agrégats
        my_total_power = sum(
            sum(c["power"] for c in m["p0" if from_player == 0 else "p1"] if not c["hidden"])
            for m in self.missions
        )
        opp_total_power = sum(
            sum(c["power"] for c in m["p1" if from_player == 0 else "p0"] if not c["hidden"])
            for m in self.missions
        )

        f[idx] = min(my_total_power / 40, 1.0); idx += 1
        f[idx] = min(opp_total_power / 40, 1.0); idx += 1
        f[idx] = (my_total_power - opp_total_power + 40) / 80; idx += 1
        pt_diff = self.mission_points[from_player] - self.mission_points[other]
        f[idx] = (pt_diff + 20) / 40; idx += 1
        ck_diff = self.chakra[from_player] - self.chakra[other]
        f[idx] = (ck_diff + 20) / 40; idx += 1

        my_hidden_total = sum(
            sum(1 for c in m["p0" if from_player == 0 else "p1"] if c["hidden"])
            for m in self.missions
        )
        opp_hidden_total = sum(
            sum(1 for c in m["p1" if from_player == 0 else "p0"] if c["hidden"])
            for m in self.missions
        )
        f[idx] = min(my_hidden_total / 8, 1.0); idx += 1
        f[idx] = min(opp_hidden_total / 8, 1.0); idx += 1

        my_winning = sum(
            1 for m in self.missions
            if sum(c["power"] for c in m["p0" if from_player == 0 else "p1"] if not c["hidden"]) >
               sum(c["power"] for c in m["p1" if from_player == 0 else "p0"] if not c["hidden"])
        )
        f[idx] = my_winning / 4; idx += 1
        f[idx] = min(len(my_hand) / 10, 1.0); idx += 1  # peut encore jouer
        f[idx] = (4 - self.turn) / 4; idx += 1  # tours restants
        f[idx] = 1.0 if my_hand and self.chakra[from_player] >= min(c.chakra for c in my_hand) else 0.0; idx += 1

        # Padding
        f[idx:] = 0.0
        np.clip(f, 0.0, 1.0, out=f)
        return f

    def action_mask(self, player: int) -> np.ndarray:
        """Masque binaire des actions valides (1=valide, 0=invalide)."""
        mask = np.zeros(MAX_ACTIONS, dtype=np.float32)
        for a in self._get_valid_actions(player):
            if a < MAX_ACTIONS:
                mask[a] = 1.0
        if mask.sum() == 0:
            mask[0] = 1.0  # PASS de secours
        return mask


# ──────────────────────────────────────────────────────────────────────────────
# Actor-Critic Network
# ──────────────────────────────────────────────────────────────────────────────

class NarutoActorCritic(nn.Module):
    """
    Réseau Actor-Critic partagé.
    Compatible avec NarutoValueNet : le tronc est identique,
    on ajoute une tête de politique en plus de la tête de valeur.

    Peut être initialisé depuis un checkpoint NarutoValueNet supervisé.
    """

    def __init__(self, input_dim: int = FEATURE_DIM, hidden_dim: int = 512, n_actions: int = MAX_ACTIONS):
        super().__init__()
        self.input_dim = input_dim
        self.n_actions = n_actions

        # Tronc partagé (même architecture que NarutoValueNet)
        self.input_norm = nn.LayerNorm(input_dim)
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.norm1 = nn.LayerNorm(hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.fc3 = nn.Linear(hidden_dim, hidden_dim // 2)
        self.norm3 = nn.LayerNorm(hidden_dim // 2)
        self.fc4 = nn.Linear(hidden_dim // 2, hidden_dim // 4)
        self.norm4 = nn.LayerNorm(hidden_dim // 4)
        self.dropout = nn.Dropout(0.1)

        latent_dim = hidden_dim // 4

        # Tête de valeur (compatible avec NarutoValueNet)
        self.value_head = nn.Sequential(
            nn.Linear(latent_dim, 64),
            nn.GELU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

        # Tête de politique (nouvelle)
        self.policy_head = nn.Sequential(
            nn.Linear(latent_dim, 128),
            nn.GELU(),
            nn.Linear(128, n_actions),
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
        # Initialiser la policy head à une distribution presque uniforme
        nn.init.zeros_(self.policy_head[-1].weight)
        nn.init.zeros_(self.policy_head[-1].bias)

    def _trunk(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_norm(x)
        x = F.gelu(self.norm1(self.fc1(x))); x = self.dropout(x)
        x = F.gelu(self.norm2(self.fc2(x))); x = self.dropout(x)
        x = F.gelu(self.norm3(self.fc3(x))); x = self.dropout(x)
        x = F.gelu(self.norm4(self.fc4(x)))
        return x

    def forward(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None):
        latent = self._trunk(x)
        value = self.value_head(latent).squeeze(-1)
        logits = self.policy_head(latent)

        if mask is not None:
            # Masquer les actions invalides avec -1e9
            logits = logits + (mask - 1) * 1e9

        return logits, value

    def get_action(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None):
        logits, value = self.forward(x, mask)
        dist = Categorical(logits=logits)
        action = dist.sample()
        log_prob = dist.log_prob(action)
        return action, log_prob, value

    def evaluate(self, x: torch.Tensor, action: torch.Tensor, mask: Optional[torch.Tensor] = None):
        logits, value = self.forward(x, mask)
        dist = Categorical(logits=logits)
        log_prob = dist.log_prob(action)
        entropy = dist.entropy()
        return log_prob, value, entropy

    def load_from_value_net(self, checkpoint_path: str, device: torch.device):
        """Charge le tronc depuis un checkpoint NarutoValueNet (transfer learning)."""
        checkpoint = torch.load(checkpoint_path, map_location=device)
        state = checkpoint.get("model_state", checkpoint)

        # Filtrer les clés compatibles (tronc + value_head)
        compatible = {k: v for k, v in state.items() if k in self.state_dict()}
        missing, unexpected = self.load_state_dict(compatible, strict=False)
        print(f"    Loaded {len(compatible)} layers from value net")
        if missing:
            print(f"    New (random) layers: {missing[:5]}{'...' if len(missing) > 5 else ''}")
        return self


# ──────────────────────────────────────────────────────────────────────────────
# Buffer d'expérience (Rollout)
# ──────────────────────────────────────────────────────────────────────────────

class RolloutBuffer:
    def __init__(self, capacity: int, feature_dim: int, n_actions: int):
        self.obs = np.zeros((capacity, feature_dim), dtype=np.float32)
        self.actions = np.zeros(capacity, dtype=np.int64)
        self.log_probs = np.zeros(capacity, dtype=np.float32)
        self.rewards = np.zeros(capacity, dtype=np.float32)
        self.values = np.zeros(capacity, dtype=np.float32)
        self.dones = np.zeros(capacity, dtype=np.float32)
        self.masks = np.zeros((capacity, n_actions), dtype=np.float32)
        self.ptr = 0
        self.capacity = capacity

    def add(self, obs, action, log_prob, reward, value, done, mask):
        self.obs[self.ptr] = obs
        self.actions[self.ptr] = action
        self.log_probs[self.ptr] = log_prob
        self.rewards[self.ptr] = reward
        self.values[self.ptr] = value
        self.dones[self.ptr] = done
        self.masks[self.ptr] = mask
        self.ptr += 1

    def is_full(self) -> bool:
        return self.ptr >= self.capacity

    def clear(self):
        self.ptr = 0

    def compute_returns(self, last_value: float, gamma: float = 0.99, gae_lambda: float = 0.95):
        """Compute GAE advantages and returns."""
        advantages = np.zeros(self.ptr, dtype=np.float32)
        last_gae = 0.0

        for t in reversed(range(self.ptr)):
            next_val = last_value if t == self.ptr - 1 else self.values[t + 1]
            next_done = self.dones[t]
            delta = self.rewards[t] + gamma * next_val * (1 - next_done) - self.values[t]
            last_gae = delta + gamma * gae_lambda * (1 - next_done) * last_gae
            advantages[t] = last_gae

        returns = advantages + self.values[:self.ptr]
        return advantages, returns


# ──────────────────────────────────────────────────────────────────────────────
# PPO Trainer
# ──────────────────────────────────────────────────────────────────────────────

class PPOTrainer:
    def __init__(self, args):
        self.args = args
        self.device = self._setup_device()

        # Modèle
        hidden_dim = 1024 if args.large else 512
        self.model = NarutoActorCritic(
            input_dim=FEATURE_DIM,
            hidden_dim=hidden_dim,
            n_actions=MAX_ACTIONS,
        ).to(self.device)

        # Transfer learning depuis le modèle supervisé
        if args.pretrained and os.path.exists(args.pretrained):
            print(f"  Chargement du modèle supervisé : {args.pretrained}")
            self.model.load_from_value_net(args.pretrained, self.device)

        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=args.lr)

        # Stats
        self.ep_rewards = deque(maxlen=100)
        self.ep_lengths = deque(maxlen=100)
        self.win_rates = deque(maxlen=100)
        self.total_steps = 0
        self.total_episodes = 0

    def _setup_device(self) -> torch.device:
        if self.args.gpu and torch.cuda.is_available():
            device = torch.device("cuda")
            print(f"  GPU : {torch.cuda.get_device_name(0)}")
        else:
            device = torch.device("cpu")
            print("  CPU mode")
        return device

    def _collect_rollout(self, buffer: RolloutBuffer):
        """Collecte des épisodes dans le buffer."""
        envs = [NarutoSimpleEnv() for _ in range(self.args.n_envs)]
        obs_list = [env.reset() for env in envs]
        ep_rew = [0.0] * self.args.n_envs
        ep_len = [0] * self.args.n_envs

        buffer.clear()

        while not buffer.is_full():
            obs_arr = np.array(obs_list, dtype=np.float32)
            masks_arr = np.array([env.action_mask(env.active_player) for env in envs], dtype=np.float32)

            obs_t = torch.from_numpy(obs_arr).to(self.device)
            masks_t = torch.from_numpy(masks_arr).to(self.device)

            with torch.no_grad():
                actions, log_probs, values = self.model.get_action(obs_t, masks_t)

            actions_np = actions.cpu().numpy()
            log_probs_np = log_probs.cpu().numpy()
            values_np = values.cpu().numpy()

            for i, env in enumerate(envs):
                if buffer.is_full():
                    break

                action = int(actions_np[i])
                obs, reward, done, info = env.step(action)

                buffer.add(
                    obs_list[i], action, log_probs_np[i],
                    reward, values_np[i], float(done), masks_arr[i]
                )

                ep_rew[i] += reward
                ep_len[i] += 1
                self.total_steps += 1

                if done:
                    self.ep_rewards.append(ep_rew[i])
                    self.ep_lengths.append(ep_len[i])
                    winner = info.get("winner", -1)
                    self.win_rates.append(1.0 if winner == 0 else 0.0)
                    self.total_episodes += 1

                    obs_list[i] = env.reset()
                    ep_rew[i] = 0.0
                    ep_len[i] = 0
                else:
                    obs_list[i] = obs

        # Valeur du dernier état
        last_obs = torch.from_numpy(np.array(obs_list[:1], dtype=np.float32)).to(self.device)
        with torch.no_grad():
            _, last_val = self.model.forward(last_obs)
        return float(last_val.cpu().item())

    def _update(self, buffer: RolloutBuffer, last_value: float):
        """Mise à jour PPO (K epochs sur le buffer collecté)."""
        advantages, returns = buffer.compute_returns(last_value, self.args.gamma, self.args.gae_lambda)

        # Normaliser les avantages
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # Tenseurs
        obs_t = torch.from_numpy(buffer.obs[:buffer.ptr]).to(self.device)
        acts_t = torch.from_numpy(buffer.actions[:buffer.ptr]).to(self.device)
        old_lp_t = torch.from_numpy(buffer.log_probs[:buffer.ptr]).to(self.device)
        adv_t = torch.from_numpy(advantages).to(self.device)
        ret_t = torch.from_numpy(returns).to(self.device)
        masks_t = torch.from_numpy(buffer.masks[:buffer.ptr]).to(self.device)

        n = buffer.ptr
        batch_size = self.args.batch_size
        losses = []

        for _ in range(self.args.ppo_epochs):
            # Mini-batches aléatoires
            indices = np.random.permutation(n)
            for start in range(0, n, batch_size):
                idx = torch.from_numpy(indices[start:start + batch_size]).to(self.device)

                log_probs, values, entropy = self.model.evaluate(
                    obs_t[idx], acts_t[idx], masks_t[idx]
                )

                # Ratio
                ratio = torch.exp(log_probs - old_lp_t[idx])
                adv_b = adv_t[idx]

                # Clipped policy loss
                loss_clip = torch.min(
                    ratio * adv_b,
                    torch.clamp(ratio, 1 - self.args.clip_eps, 1 + self.args.clip_eps) * adv_b
                ).mean()

                # Value loss
                loss_val = F.mse_loss(values, ret_t[idx])

                # Entropy bonus
                loss_ent = entropy.mean()

                loss = -loss_clip + self.args.vf_coef * loss_val - self.args.ent_coef * loss_ent

                self.optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), 0.5)
                self.optimizer.step()
                losses.append(loss.item())

        return float(np.mean(losses))

    def train(self):
        output_dir = Path(self.args.output)
        output_dir.mkdir(parents=True, exist_ok=True)

        buffer = RolloutBuffer(self.args.rollout_steps, FEATURE_DIM, MAX_ACTIONS)
        best_win_rate = 0.0
        start_time = time.time()
        update_idx = 0

        print("\nDémarrage entraînement PPO...")
        print("=" * 70)

        target_episodes = self.args.episodes
        log_interval = self.args.log_interval

        while self.total_episodes < target_episodes:
            last_val = self._collect_rollout(buffer)
            loss = self._update(buffer, last_val)
            update_idx += 1

            if update_idx % log_interval == 0 or self.total_episodes >= target_episodes:
                elapsed = time.time() - start_time
                avg_rew = np.mean(self.ep_rewards) if self.ep_rewards else 0.0
                avg_len = np.mean(self.ep_lengths) if self.ep_lengths else 0.0
                win_rate = np.mean(self.win_rates) if self.win_rates else 0.5
                eps_per_s = self.total_episodes / max(1, elapsed)

                print(
                    f"  Ep {self.total_episodes:>7,}/{target_episodes} | "
                    f"win={win_rate:.2%} | "
                    f"rew={avg_rew:+.3f} | "
                    f"len={avg_len:.1f} | "
                    f"loss={loss:.4f} | "
                    f"{eps_per_s:.1f} ep/s | "
                    f"{elapsed/60:.1f}min"
                )

                # Sauvegarder le meilleur modèle
                if win_rate >= best_win_rate:
                    best_win_rate = win_rate
                    self._save(output_dir / "ppo_best.pth", update_idx, win_rate)

            # Checkpoint toutes les 5000 mises à jour
            if update_idx % 5000 == 0:
                self._save(output_dir / f"ppo_checkpoint_{update_idx:06d}.pth", update_idx, 0.0)

        print(f"\n{'=' * 70}")
        print(f"  Entraînement terminé : {self.total_episodes:,} épisodes")
        print(f"  Meilleur win rate    : {best_win_rate:.2%}")
        print(f"  Modèle sauvé         : {output_dir}/ppo_best.pth")
        print(f"{'=' * 70}")

        # Export ONNX du modèle PPO (tête de valeur uniquement, compatible)
        self._export_value_head(output_dir / "ppo_best.pth", output_dir)

    def _save(self, path: Path, step: int, win_rate: float):
        torch.save({
            "step": step,
            "model_state": self.model.state_dict(),
            "optimizer_state": self.optimizer.state_dict(),
            "win_rate": win_rate,
            "total_episodes": self.total_episodes,
        }, str(path))

    def _export_value_head(self, ppo_checkpoint: Path, output_dir: Path):
        """
        Exporte la tête de valeur du modèle PPO vers un format compatible
        avec NarutoValueNet (pour utilisation dans ISMCTS).
        """
        try:
            from model import NarutoValueNetLarge, NarutoValueNet
        except ImportError:
            print("  [WARN] model.py non trouvé, export value head ignoré")
            return

        checkpoint = torch.load(str(ppo_checkpoint), map_location="cpu")
        ppo_state = checkpoint["model_state"]

        # Créer un NarutoValueNet et copier les poids compatibles
        if self.args.large:
            value_net = NarutoValueNetLarge(input_dim=FEATURE_DIM)
        else:
            value_net = NarutoValueNet(input_dim=FEATURE_DIM)

        compatible = {k: v for k, v in ppo_state.items() if k in value_net.state_dict()}
        value_net.load_state_dict(compatible, strict=False)

        value_net_path = output_dir / "ppo_value_head.pth"
        torch.save({"model_state": value_net.state_dict()}, str(value_net_path))
        print(f"  Tête de valeur PPO exportée : {value_net_path}")
        print("  -> Utilisez ce fichier avec export_onnx.py pour obtenir naruto_ai.onnx")


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="PPO Self-Play pour Naruto Mythos TCG")
    p.add_argument("--episodes", type=int, default=100_000, help="Nombre total d'épisodes")
    p.add_argument("--n-envs", type=int, default=16, help="Environnements parallèles")
    p.add_argument("--rollout-steps", type=int, default=2048, help="Steps par rollout")
    p.add_argument("--ppo-epochs", type=int, default=4, help="Epochs PPO par update")
    p.add_argument("--batch-size", type=int, default=256, help="Mini-batch size PPO")
    p.add_argument("--lr", type=float, default=3e-4, help="Learning rate")
    p.add_argument("--gamma", type=float, default=0.99, help="Discount factor")
    p.add_argument("--gae-lambda", type=float, default=0.95, help="GAE lambda")
    p.add_argument("--clip-eps", type=float, default=0.2, help="PPO clip epsilon")
    p.add_argument("--vf-coef", type=float, default=0.5, help="Value function coefficient")
    p.add_argument("--ent-coef", type=float, default=0.01, help="Entropy coefficient")
    p.add_argument("--gpu", action="store_true", help="Utiliser le GPU (CUDA)")
    p.add_argument("--large", action="store_true", help="Grand modèle (1024 hidden)")
    p.add_argument("--pretrained", default="", help="Checkpoint supervisé à utiliser comme base")
    p.add_argument("--output", default="../public/models", help="Dossier de sortie")
    p.add_argument("--log-interval", type=int, default=10, help="Log tous les N updates")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()

    print("=" * 70)
    print("  NARUTO MYTHOS TCG — PPO Self-Play")
    print("=" * 70)
    print(f"  Épisodes       : {args.episodes:,}")
    print(f"  Envs parallèles: {args.n_envs}")
    print(f"  Rollout steps  : {args.rollout_steps}")
    print(f"  PPO epochs     : {args.ppo_epochs}")
    print(f"  Learning rate  : {args.lr}")
    print(f"  GPU            : {args.gpu}")
    print(f"  Large model    : {args.large}")
    if args.pretrained:
        print(f"  Pretrained     : {args.pretrained}")
    print("=" * 70)

    trainer = PPOTrainer(args)
    trainer.train()
