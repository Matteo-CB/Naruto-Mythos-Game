"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { useGameStore } from "@/stores/gameStore";
import { useUIStore } from "@/stores/uiStore";
import { effectDescriptionsFr } from "@/lib/data/effectTranslationsFr";
import { GameInfo } from "./GameInfo";
import { PlayerHand } from "./PlayerHand";
import { OpponentHand } from "./OpponentHand";
import { MissionLane } from "./MissionLane";
import { ActionBar } from "./ActionBar";
import { MulliganDialog } from "./MulliganDialog";
import { GameEndScreen } from "./GameEndScreen";
import { GameLog } from "./GameLog";
import { TurnOverlay } from "./TurnOverlay";
import { AnimationController } from "./AnimationController";
import { TargetSelector } from "./TargetSelector";
import { HandCardSelector } from "./HandCardSelector";
import type { CharacterCard, MissionCard } from "@/lib/engine/types";

// ----- Shared color maps -----

const rarityColorMap: Record<string, string> = {
  C: "#888888",
  UC: "#3e8b3e",
  R: "#c4a35a",
  RA: "#c4a35a",
  S: "#b33e3e",
  M: "#6a6abb",
  Legendary: "#e0c040",
  Mission: "#c4a35a",
};

const effectTypeColorMap: Record<string, string> = {
  MAIN: "#c4a35a",
  AMBUSH: "#b33e3e",
  UPGRADE: "#3e8b3e",
  SCORE: "#6a6abb",
};

const rankColorMap: Record<string, string> = {
  D: "#3e8b3e",
  C: "#c4a35a",
  B: "#b37e3e",
  A: "#b33e3e",
};

// ----- Card Preview Content (shared between hover and pinned) -----

function CardPreviewContent({
  card,
  missionContext,
  isPinned,
}: {
  card: CharacterCard | MissionCard;
  missionContext: { rank: string; basePoints: number; rankBonus: number } | null;
  isPinned: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const unpinCard = useUIStore((s) => s.unpinCard);
  const toggleFullscreenCard = useUIStore((s) => s.toggleFullscreenCard);

  const isCharacter = card.card_type === "character";
  const isMission = card.card_type === "mission";
  const imagePath = card.image_file
    ? card.image_file.replace(/\\/g, "/").startsWith("/")
      ? card.image_file.replace(/\\/g, "/")
      : `/${card.image_file.replace(/\\/g, "/")}`
    : null;

  const rarityColor = rarityColorMap[card.rarity] ?? "#888888";

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{
        backgroundColor: "rgba(8, 8, 12, 0.95)",
        border: isMission
          ? `1px solid ${rankColorMap[missionContext?.rank ?? ""] ?? "rgba(196, 163, 90, 0.3)"}`
          : "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow:
          "0 8px 40px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(16px)",
        maxHeight: "calc(100vh - 32px)",
      }}
    >
      {/* Card image */}
      {imagePath ? (
        <div
          className="w-full shrink-0 flex items-center justify-center"
          style={{
            backgroundColor: "#0a0a0c",
            height: isCharacter ? "200px" : "140px",
          }}
        >
          <img
            src={imagePath}
            alt={card.name_fr}
            draggable={false}
            className="w-full h-full"
            style={{ objectFit: "contain" }}
          />
        </div>
      ) : (
        <div
          className="w-full shrink-0 flex items-center justify-center"
          style={{
            backgroundColor: "#1a1a1a",
            height: isCharacter ? "200px" : "140px",
          }}
        >
          <span className="text-xs" style={{ color: "#555555" }}>
            {t("card.noImage")}
          </span>
        </div>
      )}

      {/* Card details (scrollable) */}
      <div
        className="p-3.5 flex flex-col gap-2 overflow-y-auto"
        style={{ maxHeight: "380px" }}
      >
        {/* Type badge + Rarity */}
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] rounded px-1.5 py-0.5 font-bold uppercase tracking-wider"
            style={{
              backgroundColor: isMission
                ? "rgba(196, 163, 90, 0.12)"
                : "rgba(255, 255, 255, 0.04)",
              color: isMission ? "#c4a35a" : "#888888",
              border: `1px solid ${isMission ? "rgba(196, 163, 90, 0.2)" : "rgba(255, 255, 255, 0.06)"}`,
            }}
          >
            {isMission ? t("card.mission") : t("card.character")}
          </span>
          <span
            className="text-[10px] rounded px-1.5 py-0.5 shrink-0 font-bold"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${rarityColor}`,
              color: rarityColor,
            }}
          >
            {card.rarity}
          </span>
        </div>

        {/* Name */}
        <span
          className="text-sm font-bold leading-tight"
          style={{ color: "#e0e0e0" }}
        >
          {card.name_fr}
        </span>

        {/* English name for missions */}
        {isMission && card.name_en && (
          <span className="text-xs -mt-1" style={{ color: "#666666" }}>
            {card.name_en}
          </span>
        )}

        {/* Title */}
        {card.title_fr && (
          <span className="text-xs" style={{ color: "#999999" }}>
            {card.title_fr}
          </span>
        )}

        {/* Mission rank + points info */}
        {isMission && missionContext && (
          <div
            className="flex flex-col gap-1.5 p-2.5 rounded-md mt-0.5"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: `1px solid ${rankColorMap[missionContext.rank] ?? "#555"}40`,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: "#aaaaaa" }}
              >
                {t("card.rank")}
              </span>
              <span
                className="text-sm font-bold px-2 py-0.5 rounded"
                style={{
                  color: rankColorMap[missionContext.rank] ?? "#888",
                  backgroundColor: `${rankColorMap[missionContext.rank] ?? "#888"}15`,
                }}
              >
                {missionContext.rank}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "#888888" }}>
                {t("game.board.base")}
              </span>
              <span
                className="text-xs tabular-nums"
                style={{ color: "#aaaaaa" }}
              >
                {missionContext.basePoints} {t("game.board.pts")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "#888888" }}>
                {t("card.rankBonus")}
              </span>
              <span
                className="text-xs tabular-nums"
                style={{ color: "#aaaaaa" }}
              >
                +{missionContext.rankBonus} {t("game.board.pts")}
              </span>
            </div>
            <div
              className="flex items-center justify-between pt-1.5 mt-0.5"
              style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
            >
              <span
                className="text-xs font-bold"
                style={{ color: "#c4a35a" }}
              >
                {t("card.totalPoints")}
              </span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: "#c4a35a" }}
              >
                {missionContext.basePoints + missionContext.rankBonus}{" "}
                {t("game.board.pts")}
              </span>
            </div>
          </div>
        )}

        {/* Base points fallback for mission cards without context */}
        {isMission && !missionContext && "basePoints" in card && (
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs" style={{ color: "#c4a35a" }}>
              {t("game.board.base")}: {(card as MissionCard).basePoints}{" "}
              {t("game.board.pts")}
            </span>
          </div>
        )}

        {/* Chakra + Power (character cards) */}
        {isCharacter && (
          <div
            className="flex items-center gap-4 p-2 rounded-md mt-0.5"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "#888888" }}
              >
                {t("collection.details.cost")}
              </span>
              <span
                className="text-base font-bold"
                style={{ color: "#c4a35a" }}
              >
                {(card as CharacterCard).chakra}
              </span>
            </div>
            <div
              className="w-px h-6 shrink-0"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
            />
            <div className="flex flex-col items-center gap-0.5">
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "#888888" }}
              >
                {t("collection.details.power")}
              </span>
              <span
                className="text-base font-bold"
                style={{ color: "#e0e0e0" }}
              >
                {(card as CharacterCard).power}
              </span>
            </div>
          </div>
        )}

        {/* Keywords */}
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {card.keywords.map((kw) => (
              <span
                key={kw}
                className="text-[10px] rounded px-1.5 py-0.5"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: "#999999",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Group */}
        {card.group && (
          <span className="text-[10px]" style={{ color: "#777777" }}>
            {t("collection.details.group")}: {card.group}
          </span>
        )}

        {/* Card ID */}
        <span className="text-[9px]" style={{ color: "#444444" }}>
          {card.id}
        </span>

        {/* Effects section */}
        <div
          className="mt-0.5 flex flex-col gap-2 pt-2"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "#888888" }}
          >
            {t("card.effects")}
          </span>

          {card.effects && card.effects.length > 0 ? (
            card.effects.map((effect, i) => {
              const frDescriptions = effectDescriptionsFr[card.id];
              const description =
                locale === "fr" && frDescriptions?.[i]
                  ? frDescriptions[i]
                  : effect.description;

              return (
                <div
                  key={i}
                  className="flex flex-col gap-0.5 p-2 rounded"
                  style={{
                    backgroundColor: `${effectTypeColorMap[effect.type] ?? "#888888"}08`,
                    border: `1px solid ${effectTypeColorMap[effect.type] ?? "#888888"}15`,
                  }}
                >
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{
                      color: effectTypeColorMap[effect.type] ?? "#888888",
                    }}
                  >
                    {t(
                      `card.effectTypes.${effect.type}` as
                        | "card.effectTypes.MAIN"
                        | "card.effectTypes.UPGRADE"
                        | "card.effectTypes.AMBUSH"
                        | "card.effectTypes.SCORE",
                    )}
                  </span>
                  <span
                    className="font-body text-[11px] leading-snug"
                    style={{ color: "#aaaaaa" }}
                  >
                    {description}
                  </span>
                </div>
              );
            })
          ) : (
            <span className="text-[10px]" style={{ color: "#555555" }}>
              {t("card.noEffects")}
            </span>
          )}
        </div>
      </div>

      {/* Pinned action buttons */}
      {isPinned && (
        <div
          className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreenCard();
            }}
            className="text-[11px] font-medium px-3 py-1 rounded cursor-pointer"
            style={{
              backgroundColor: "rgba(196, 163, 90, 0.12)",
              color: "#c4a35a",
              border: "1px solid rgba(196, 163, 90, 0.3)",
            }}
          >
            {t("card.fullscreen")}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              unpinCard();
            }}
            className="text-[11px] font-bold px-2.5 py-1 rounded cursor-pointer"
            style={{
              backgroundColor: "rgba(179, 62, 62, 0.12)",
              color: "#b33e3e",
              border: "1px solid rgba(179, 62, 62, 0.3)",
            }}
          >
            X
          </button>
        </div>
      )}
    </div>
  );
}

// ----- Card Preview Panel (fixed right-side) -----

function CardPreview() {
  const previewCard = useUIStore((s) => s.previewCard);
  const previewMissionContext = useUIStore((s) => s.previewMissionContext);
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const pinnedMissionContext = useUIStore((s) => s.pinnedMissionContext);

  const displayCard = pinnedCard ?? previewCard;
  const displayMissionContext = pinnedCard ? pinnedMissionContext : previewMissionContext;
  const isPinned = !!pinnedCard;

  if (!displayCard) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={`card-preview-${isPinned ? "pinned" : "hover"}`}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.15 }}
        className={`fixed z-200 ${isPinned ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          right: "16px",
          top: "16px",
          width: "280px",
          maxHeight: "calc(100vh - 32px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CardPreviewContent
          card={displayCard}
          missionContext={displayMissionContext}
          isPinned={isPinned}
        />
      </motion.div>
    </AnimatePresence>
  );
}

// ----- Fullscreen Card Detail Modal -----

function FullscreenCardDetail() {
  const t = useTranslations();
  const locale = useLocale();
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const pinnedMissionContext = useUIStore((s) => s.pinnedMissionContext);
  const showFullscreenCard = useUIStore((s) => s.showFullscreenCard);
  const toggleFullscreenCard = useUIStore((s) => s.toggleFullscreenCard);
  const unpinCard = useUIStore((s) => s.unpinCard);

  if (!showFullscreenCard || !pinnedCard) return null;

  const card = pinnedCard;
  const missionContext = pinnedMissionContext;
  const isCharacter = card.card_type === "character";
  const isMission = card.card_type === "mission";
  const imagePath = card.image_file
    ? card.image_file.replace(/\\/g, "/").startsWith("/")
      ? card.image_file.replace(/\\/g, "/")
      : `/${card.image_file.replace(/\\/g, "/")}`
    : null;

  const rarityColor = rarityColorMap[card.rarity] ?? "#888888";

  const handleClose = () => {
    toggleFullscreenCard();
    unpinCard();
  };

  return (
    <AnimatePresence>
      <motion.div
        key="fullscreen-card-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-300 flex items-center justify-center"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative flex flex-col rounded-xl overflow-hidden"
          style={{
            maxWidth: isMission ? "500px" : "400px",
            width: "90vw",
            maxHeight: "90vh",
            backgroundColor: "rgba(10, 10, 14, 0.98)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 20px 80px rgba(0, 0, 0, 0.9)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              color: "#888888",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            X
          </button>

          {/* Large card image */}
          {imagePath ? (
            <div
              className="w-full shrink-0 flex items-center justify-center"
              style={{
                backgroundColor: "#0a0a0c",
                height: isCharacter ? "320px" : "240px",
              }}
            >
              <img
                src={imagePath}
                alt={card.name_fr}
                draggable={false}
                className="w-full h-full"
                style={{ objectFit: "contain" }}
              />
            </div>
          ) : (
            <div
              className="w-full shrink-0 flex items-center justify-center"
              style={{
                backgroundColor: "#1a1a1a",
                height: isCharacter ? "320px" : "240px",
              }}
            >
              <span className="text-sm" style={{ color: "#555555" }}>
                {t("card.noImage")}
              </span>
            </div>
          )}

          {/* Full card details (scrollable) */}
          <div
            className="p-5 flex flex-col gap-3 overflow-y-auto"
            style={{ maxHeight: "calc(90vh - 340px)" }}
          >
            {/* Type badge + Rarity */}
            <div className="flex items-center justify-between">
              <span
                className="text-xs rounded px-2 py-1 font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: isMission
                    ? "rgba(196, 163, 90, 0.12)"
                    : "rgba(255, 255, 255, 0.04)",
                  color: isMission ? "#c4a35a" : "#888888",
                  border: `1px solid ${isMission ? "rgba(196, 163, 90, 0.2)" : "rgba(255, 255, 255, 0.06)"}`,
                }}
              >
                {isMission ? t("card.mission") : t("card.character")}
              </span>
              <span
                className="text-xs rounded px-2 py-1 shrink-0 font-bold"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${rarityColor}`,
                  color: rarityColor,
                }}
              >
                {card.rarity}
              </span>
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "#666666" }}>
                {t("card.name")}
              </span>
              <span
                className="text-lg font-bold leading-tight"
                style={{ color: "#e0e0e0" }}
              >
                {card.name_fr}
              </span>
            </div>

            {/* English name for missions */}
            {isMission && card.name_en && (
              <span className="text-sm -mt-1" style={{ color: "#666666" }}>
                {card.name_en}
              </span>
            )}

            {/* Title */}
            {card.title_fr && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "#666666" }}>
                  {t("card.title")}
                </span>
                <span className="text-sm" style={{ color: "#999999" }}>
                  {card.title_fr}
                </span>
              </div>
            )}

            {/* Mission rank + points info */}
            {isMission && missionContext && (
              <div
                className="flex flex-col gap-2 p-3 rounded-lg"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${rankColorMap[missionContext.rank] ?? "#555"}40`,
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "#aaaaaa" }}
                  >
                    {t("card.rank")}
                  </span>
                  <span
                    className="text-base font-bold px-3 py-1 rounded"
                    style={{
                      color: rankColorMap[missionContext.rank] ?? "#888",
                      backgroundColor: `${rankColorMap[missionContext.rank] ?? "#888"}15`,
                    }}
                  >
                    {missionContext.rank}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "#888888" }}>
                    {t("game.board.base")}
                  </span>
                  <span
                    className="text-sm tabular-nums"
                    style={{ color: "#aaaaaa" }}
                  >
                    {missionContext.basePoints} {t("game.board.pts")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "#888888" }}>
                    {t("card.rankBonus")}
                  </span>
                  <span
                    className="text-sm tabular-nums"
                    style={{ color: "#aaaaaa" }}
                  >
                    +{missionContext.rankBonus} {t("game.board.pts")}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between pt-2 mt-1"
                  style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color: "#c4a35a" }}
                  >
                    {t("card.totalPoints")}
                  </span>
                  <span
                    className="text-base font-bold tabular-nums"
                    style={{ color: "#c4a35a" }}
                  >
                    {missionContext.basePoints + missionContext.rankBonus}{" "}
                    {t("game.board.pts")}
                  </span>
                </div>
              </div>
            )}

            {/* Base points fallback */}
            {isMission && !missionContext && "basePoints" in card && (
              <div className="flex items-center gap-3">
                <span className="text-sm" style={{ color: "#c4a35a" }}>
                  {t("game.board.base")}: {(card as MissionCard).basePoints}{" "}
                  {t("game.board.pts")}
                </span>
              </div>
            )}

            {/* Chakra + Power (character cards) */}
            {isCharacter && (
              <div
                className="flex items-center gap-6 p-3 rounded-lg"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "#888888" }}
                  >
                    {t("collection.details.cost")}
                  </span>
                  <span
                    className="text-xl font-bold"
                    style={{ color: "#c4a35a" }}
                  >
                    {(card as CharacterCard).chakra}
                  </span>
                </div>
                <div
                  className="w-px h-8 shrink-0"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
                />
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "#888888" }}
                  >
                    {t("collection.details.power")}
                  </span>
                  <span
                    className="text-xl font-bold"
                    style={{ color: "#e0e0e0" }}
                  >
                    {(card as CharacterCard).power}
                  </span>
                </div>
              </div>
            )}

            {/* Keywords */}
            {card.keywords && card.keywords.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "#666666" }}>
                  {t("collection.details.keywords")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {card.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-xs rounded px-2 py-0.5"
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        color: "#999999",
                        border: "1px solid rgba(255, 255, 255, 0.04)",
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Group */}
            {card.group && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "#666666" }}>
                  {t("collection.details.group")}
                </span>
                <span className="text-sm" style={{ color: "#999999" }}>
                  {card.group}
                </span>
              </div>
            )}

            {/* Card ID */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "#666666" }}>
                {t("card.cardId")}
              </span>
              <span className="text-xs" style={{ color: "#555555" }}>
                {card.id}
              </span>
            </div>

            {/* Effects section */}
            <div
              className="flex flex-col gap-2.5 pt-3"
              style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
            >
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: "#888888" }}
              >
                {t("card.effects")}
              </span>

              {card.effects && card.effects.length > 0 ? (
                card.effects.map((effect, i) => {
                  const frDescriptions = effectDescriptionsFr[card.id];
                  const description =
                    locale === "fr" && frDescriptions?.[i]
                      ? frDescriptions[i]
                      : effect.description;

                  return (
                    <div
                      key={i}
                      className="flex flex-col gap-1 p-3 rounded-lg"
                      style={{
                        backgroundColor: `${effectTypeColorMap[effect.type] ?? "#888888"}08`,
                        border: `1px solid ${effectTypeColorMap[effect.type] ?? "#888888"}15`,
                      }}
                    >
                      <span
                        className="text-xs font-bold uppercase"
                        style={{
                          color: effectTypeColorMap[effect.type] ?? "#888888",
                        }}
                      >
                        {t(
                          `card.effectTypes.${effect.type}` as
                            | "card.effectTypes.MAIN"
                            | "card.effectTypes.UPGRADE"
                            | "card.effectTypes.AMBUSH"
                            | "card.effectTypes.SCORE",
                        )}
                      </span>
                      <span
                        className="font-body text-sm leading-relaxed"
                        style={{ color: "#bbbbbb" }}
                      >
                        {description}
                      </span>
                    </div>
                  );
                })
              ) : (
                <span className="text-xs" style={{ color: "#555555" }}>
                  {t("card.noEffects")}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ----- Main Game Board -----

export default function GameBoard() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const gameOver = useGameStore((s) => s.gameOver);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const showTurnTransition = useUIStore((s) => s.showTurnTransition);
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const unpinCard = useUIStore((s) => s.unpinCard);

  const prevTurnRef = useRef<number | null>(null);

  useEffect(() => {
    if (visibleState) {
      const currentTurn = visibleState.turn;
      if (prevTurnRef.current !== null && prevTurnRef.current !== currentTurn) {
        showTurnTransition(t("game.turn", { turn: currentTurn }));
      }
      prevTurnRef.current = currentTurn;
    }
  }, [visibleState?.turn, showTurnTransition, visibleState, t]);

  // Clicking the board background unpins
  const handleBoardClick = useCallback(() => {
    if (pinnedCard) {
      unpinCard();
    }
  }, [pinnedCard, unpinCard]);

  if (!visibleState) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <motion.span
          className="text-lg"
          style={{ color: "#888888" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          {t("common.loading")}
        </motion.span>
      </div>
    );
  }

  const { myState, opponentState, activeMissions, phase } = visibleState;

  return (
    <div
      className="w-screen h-screen flex overflow-hidden no-select"
      style={{
        backgroundColor: "#0a0a0a",
        backgroundImage: "url(/images/bg-game.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
      }}
      onClick={handleBoardClick}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
      />

      <aside
        className="shrink-0 overflow-y-auto relative z-10"
        style={{
          width: "190px",
          borderRight: "1px solid rgba(255, 255, 255, 0.05)",
          backgroundColor: "rgba(8, 8, 12, 0.88)",
          backdropFilter: "blur(12px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <GameInfo />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Opponent hand */}
        <section
          className="shrink-0 flex items-center justify-center py-1"
          style={{
            borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
            height: "85px",
            backgroundColor: "rgba(8, 8, 12, 0.45)",
            backdropFilter: "blur(6px)",
          }}
        >
          <OpponentHand handSize={opponentState.handSize} />
        </section>

        {/* Mission area with floating ActionBar */}
        <section className="flex-1 flex flex-col min-h-0 relative">
          <div className="flex-1 flex items-stretch justify-center px-3 py-0.5 min-h-0 overflow-hidden">
            <div className="flex gap-1.5 items-stretch justify-center w-full">
              {activeMissions.map((mission, index) => (
                <MissionLane
                  key={`mission-${index}`}
                  mission={mission}
                  missionIndex={index}
                />
              ))}

              {Array.from({ length: Math.max(0, 4 - activeMissions.length) }).map(
                (_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex flex-col items-center justify-center rounded-xl"
                    style={{
                      minWidth: "230px",
                      maxWidth: "320px",
                      flex: "1 1 0",
                      backgroundColor: "rgba(10, 10, 10, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.03)",
                    }}
                  >
                    <div
                      className="rounded-lg mission-aspect flex items-center justify-center"
                      style={{
                        width: "100%",
                        maxWidth: "140px",
                        minHeight: "50px",
                        border: "2px dashed rgba(255, 255, 255, 0.06)",
                      }}
                    >
                      <span
                        className="text-[10px]"
                        style={{ color: "rgba(255, 255, 255, 0.15)" }}
                      >
                        {t("game.turn", { turn: activeMissions.length + i + 1 })}
                      </span>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* ActionBar floating at bottom of mission area */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20" style={{ pointerEvents: 'auto' }}>
            <ActionBar />
          </div>
        </section>

        {/* Player hand */}
        <section
          className="shrink-0 flex items-center justify-center"
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.03)",
            height: "150px",
            backgroundColor: "rgba(8, 8, 12, 0.45)",
            backdropFilter: "blur(6px)",
          }}
        >
          <PlayerHand hand={myState.hand} chakra={myState.chakra} />
        </section>
      </main>

      <CardPreview />
      <FullscreenCardDetail />

      <MulliganDialog />
      <TurnOverlay />
      <GameLog />
      <AnimationController />
      <TargetSelector />
      <HandCardSelector />

      {gameOver && <GameEndScreen />}

      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-30 rounded-md py-1.5 px-4"
            style={{
              backgroundColor: "rgba(10, 10, 14, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
            }}
          >
            <motion.span
              className="text-[11px]"
              style={{ color: "#888888" }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              {t("game.processing")}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
