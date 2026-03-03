"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { useGameStore } from "@/stores/gameStore";
import { useUIStore } from "@/stores/uiStore";
import { effectDescriptionsFr } from "@/lib/data/effectTranslationsFr";
import { effectDescriptionsEn } from "@/lib/data/effectDescriptionsEn";
import { PlayerHand } from "./PlayerHand";
import { OpponentHand } from "./OpponentHand";
import { PlayerStatsBar } from "./PlayerStatsBar";
import { OpponentStatsBar } from "./OpponentStatsBar";
import { MissionLane } from "./MissionLane";
import { ActionBar } from "./ActionBar";
import { MulliganDialog } from "./MulliganDialog";
import { GameEndScreen } from "./GameEndScreen";
import { GameLog } from "./GameLog";
import { AnimationController } from "./AnimationController";
import { TargetSelector } from "./TargetSelector";
import { HandCardSelector } from "./HandCardSelector";
import { EffectChoiceSelector } from "./EffectChoiceSelector";
import { OpponentSidePiles, PlayerSidePiles } from "./SidePiles";
import { GameScaleProvider, useGameScale } from "./GameScaleContext";
import type { CharacterCard, MissionCard } from "@/lib/engine/types";
import { useBannedCards } from "@/lib/hooks/useBannedCards";
import { normalizeImagePath } from "@/lib/utils/imagePath";
import { getCardName, getCardTitle, getCardGroup, getCardKeyword } from "@/lib/utils/cardLocale";

// ----- Shared color maps -----

const rarityColorMap: Record<string, string> = {
  C: "#888888",
  UC: "#3e8b3e",
  R: "#c4a35a",
  RA: "#c4a35a",
  S: "#b33e3e",
  SV: "#b33e3e",
  M: "#6a6abb",
  L: "#e0c040",
  MMS: "#c4a35a",
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

  const { bannedIds } = useBannedCards();

  const isCharacter = card.card_type === "character";
  const isMission = card.card_type === "mission";
  const isBanned = bannedIds.has(card.id);
  const imagePath = !isBanned ? normalizeImagePath(card.image_file) : null;

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
            alt={getCardName(card, locale as 'en' | 'fr')}
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
          {getCardName(card, locale as 'en' | 'fr')}
        </span>

        {/* English name for missions */}
        {isMission && card.name_en && locale !== 'en' && (
          <span className="text-xs -mt-1" style={{ color: "#666666" }}>
            {card.name_en}
          </span>
        )}

        {/* Title */}
        {(card.title_fr || card.title_en) && (
          <span className="text-xs" style={{ color: "#999999" }}>
            {getCardTitle(card, locale as 'en' | 'fr')}
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
                {getCardKeyword(kw, locale as 'en' | 'fr')}
              </span>
            ))}
          </div>
        )}

        {/* Group */}
        {card.group && (
          <span className="text-[10px]" style={{ color: "#777777" }}>
            {t("collection.details.group")}: {getCardGroup(card.group, locale as 'en' | 'fr')}
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
              const raFallbackId = card.id.endsWith('-RA') ? card.id.replace('-RA', '-R') : undefined;
              const frDescriptions = effectDescriptionsFr[card.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
              const enDescriptions = effectDescriptionsEn[card.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
              const description =
                locale === "fr"
                  ? (frDescriptions?.[i] ?? enDescriptions?.[i] ?? effect.description)
                  : (enDescriptions?.[i] ?? effect.description);

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

// ----- Mobile Details Button (floating, appears when a card is pinned on mobile) -----

function MobileDetailsButton() {
  const t = useTranslations();
  const dims = useGameScale();
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const showFullscreenCard = useUIStore((s) => s.showFullscreenCard);
  const toggleFullscreenCard = useUIStore((s) => s.toggleFullscreenCard);
  // Only show on touch devices when a card is pinned and fullscreen isn't already open
  if (!dims.isMobile || !pinnedCard || showFullscreenCard) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggleFullscreenCard(); }}
      className="fullscreen-btn"
      style={{ position: 'fixed', bottom: '50px', right: '8px', zIndex: 9997, margin: 0 }}
    >
      {t('game.board.details')}
    </button>
  );
}

// ----- Card Preview Panel (fixed right-side) -----

function CardPreview() {
  const dims = useGameScale();
  const previewCard = useUIStore((s) => s.previewCard);
  const previewMissionContext = useUIStore((s) => s.previewMissionContext);
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const pinnedMissionContext = useUIStore((s) => s.pinnedMissionContext);

  const displayCard = pinnedCard ?? previewCard;
  const displayMissionContext = pinnedCard ? pinnedMissionContext : previewMissionContext;
  const isPinned = !!pinnedCard;

  // Hide the side panel on mobile — users can still tap cards for fullscreen detail
  if (!displayCard || dims.isMobile) return null;

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
  const dims = useGameScale();
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const pinnedMissionContext = useUIStore((s) => s.pinnedMissionContext);
  const showFullscreenCard = useUIStore((s) => s.showFullscreenCard);
  const toggleFullscreenCard = useUIStore((s) => s.toggleFullscreenCard);
  const unpinCard = useUIStore((s) => s.unpinCard);

  const { bannedIds } = useBannedCards();

  if (!showFullscreenCard || !pinnedCard) return null;

  const card = pinnedCard;
  const missionContext = pinnedMissionContext;
  const isCharacter = card.card_type === "character";
  const isMission = card.card_type === "mission";
  const isBanned = bannedIds.has(card.id);
  const imagePath = !isBanned ? normalizeImagePath(card.image_file) : null;

  const rarityColor = rarityColorMap[card.rarity] ?? "#888888";

  const handleClose = () => {
    toggleFullscreenCard();
    unpinCard();
  };

  // Shared card info content
  const cardInfoContent = (
    <>
      {/* Type badge + Rarity */}
      <div className="flex items-center justify-between">
        <span
          className={`${dims.isMobile ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} rounded font-bold uppercase tracking-wider`}
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
          className={`${dims.isMobile ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} rounded shrink-0 font-bold`}
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
      <div className="flex flex-col gap-0.5">
        <span
          className={`${dims.isMobile ? 'text-sm' : 'text-lg'} font-bold leading-tight`}
          style={{ color: "#e0e0e0" }}
        >
          {getCardName(card, locale as 'en' | 'fr')}
        </span>
        {(card.title_fr || card.title_en) && (
          <span className={`${dims.isMobile ? 'text-[10px]' : 'text-sm'}`} style={{ color: "#999999" }}>
            {getCardTitle(card, locale as 'en' | 'fr')}
          </span>
        )}
      </div>

      {/* Chakra + Power (character cards) */}
      {isCharacter && (
        <div
          className={`flex items-center ${dims.isMobile ? 'gap-3 p-1.5' : 'gap-6 p-3'} rounded-lg`}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span
              className={`${dims.isMobile ? 'text-[8px]' : 'text-xs'} uppercase tracking-wider`}
              style={{ color: "#888888" }}
            >
              {t("collection.details.cost")}
            </span>
            <span
              className={`${dims.isMobile ? 'text-base' : 'text-xl'} font-bold`}
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
              className={`${dims.isMobile ? 'text-[8px]' : 'text-xs'} uppercase tracking-wider`}
              style={{ color: "#888888" }}
            >
              {t("collection.details.power")}
            </span>
            <span
              className={`${dims.isMobile ? 'text-base' : 'text-xl'} font-bold`}
              style={{ color: "#e0e0e0" }}
            >
              {(card as CharacterCard).power}
            </span>
          </div>
        </div>
      )}

      {/* Mission rank + points (compact on mobile) */}
      {isMission && missionContext && (
        <div
          className={`flex flex-col gap-1 ${dims.isMobile ? 'p-1.5' : 'p-3'} rounded-lg`}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${rankColorMap[missionContext.rank] ?? "#555"}40`,
          }}
        >
          <div className="flex items-center justify-between">
            <span className={`${dims.isMobile ? 'text-[10px]' : 'text-sm'}`} style={{ color: "#aaaaaa" }}>
              {t("card.rank")}
            </span>
            <span
              className={`${dims.isMobile ? 'text-xs px-2 py-0.5' : 'text-base px-3 py-1'} font-bold rounded`}
              style={{
                color: rankColorMap[missionContext.rank] ?? "#888",
                backgroundColor: `${rankColorMap[missionContext.rank] ?? "#888"}15`,
              }}
            >
              {missionContext.rank}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`${dims.isMobile ? 'text-[10px]' : 'text-sm'} font-bold`} style={{ color: "#c4a35a" }}>
              {t("card.totalPoints")}
            </span>
            <span className={`${dims.isMobile ? 'text-xs' : 'text-base'} font-bold tabular-nums`} style={{ color: "#c4a35a" }}>
              {missionContext.basePoints + missionContext.rankBonus} {t("game.board.pts")}
            </span>
          </div>
        </div>
      )}

      {/* Base points fallback */}
      {isMission && !missionContext && "basePoints" in card && (
        <span className="text-xs" style={{ color: "#c4a35a" }}>
          {t("game.board.base")}: {(card as MissionCard).basePoints} {t("game.board.pts")}
        </span>
      )}

      {/* Keywords */}
      {card.keywords && card.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.keywords.map((kw) => (
            <span
              key={kw}
              className={`${dims.isMobile ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} rounded`}
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                color: "#999999",
                border: "1px solid rgba(255, 255, 255, 0.04)",
              }}
            >
              {getCardKeyword(kw, locale as 'en' | 'fr')}
            </span>
          ))}
        </div>
      )}

      {/* Group */}
      {card.group && (
        <span className={`${dims.isMobile ? 'text-[10px]' : 'text-sm'}`} style={{ color: "#999999" }}>
          {getCardGroup(card.group, locale as 'en' | 'fr')}
        </span>
      )}

      {/* Effects section */}
      <div
        className={`flex flex-col ${dims.isMobile ? 'gap-1.5 pt-1.5' : 'gap-2.5 pt-3'}`}
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <span
          className={`${dims.isMobile ? 'text-[9px]' : 'text-xs'} font-bold uppercase tracking-wider`}
          style={{ color: "#888888" }}
        >
          {t("card.effects")}
        </span>

        {card.effects && card.effects.length > 0 ? (
          card.effects.map((effect, i) => {
            const raFallbackId2 = card.id.endsWith('-RA') ? card.id.replace('-RA', '-R') : undefined;
            const frDescriptions = effectDescriptionsFr[card.id] ?? (raFallbackId2 ? effectDescriptionsFr[raFallbackId2] : undefined);
            const enDescriptions2 = effectDescriptionsEn[card.id] ?? (raFallbackId2 ? effectDescriptionsEn[raFallbackId2] : undefined);
            const description =
              locale === "fr"
                ? (frDescriptions?.[i] ?? enDescriptions2?.[i] ?? effect.description)
                : (enDescriptions2?.[i] ?? effect.description);

            return (
              <div
                key={i}
                className={`flex flex-col gap-0.5 ${dims.isMobile ? 'p-1.5' : 'p-3'} rounded-lg`}
                style={{
                  backgroundColor: `${effectTypeColorMap[effect.type] ?? "#888888"}08`,
                  border: `1px solid ${effectTypeColorMap[effect.type] ?? "#888888"}15`,
                }}
              >
                <span
                  className={`${dims.isMobile ? 'text-[9px]' : 'text-xs'} font-bold uppercase`}
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
                  className={`font-body ${dims.isMobile ? 'text-[10px] leading-snug' : 'text-sm leading-relaxed'}`}
                  style={{ color: "#bbbbbb" }}
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
    </>
  );

  // Mobile: bottom sheet — slides up from bottom, no backdrop click (avoids ghost-click bug)
  if (dims.isMobile) {
    return (
      <>
        {/* Backdrop — pointer-events-none to prevent ghost clicks from the Details tap */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", zIndex: 299 }}
        />
        {/* Bottom sheet */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="fixed bottom-0 left-0 right-0 flex flex-col overflow-hidden"
          style={{
            zIndex: 300,
            maxHeight: "80vh",
            backgroundColor: "rgba(10, 10, 14, 0.98)",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.7)",
          }}
        >
          {/* Close button — only toggles fullscreen, keeps card pinned so Details btn reappears */}
          <button
            onClick={() => toggleFullscreenCard()}
            className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold cursor-pointer"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              color: "#888888",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            X
          </button>

          {/* Card image — sized to fill a good portion of the sheet */}
          {imagePath ? (
            <div
              className="w-full shrink-0 flex items-center justify-center"
              style={{ height: "min(45vw, 36vh)", backgroundColor: "#0a0a0c" }}
            >
              <img
                src={imagePath}
                alt={getCardName(card, locale as "en" | "fr")}
                draggable={false}
                className="h-full w-auto"
                style={{ objectFit: "contain" }}
              />
            </div>
          ) : (
            <div
              className="w-full shrink-0 flex items-center justify-center"
              style={{ height: "48px", backgroundColor: "#1a1a1a" }}
            >
              <span className="text-[10px]" style={{ color: "#555555" }}>
                {t("card.noImage")}
              </span>
            </div>
          )}

          {/* Scrollable card info */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {cardInfoContent}
          </div>
        </motion.div>
      </>
    );
  }

  // Desktop: centered fullscreen modal (unchanged)
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
                alt={getCardName(card, locale as 'en' | 'fr')}
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
            {cardInfoContent}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ----- Beta Test Notification -----

const BETA_DISMISSED_KEY = 'naruto-mythos-beta-dismissed';

function BetaNotification() {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(BETA_DISMISSED_KEY)) {
        setVisible(true);
      }
    } catch { /* SSR / privacy */ }
  }, []);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.3 }}
      className="fixed top-3 right-3 z-300 flex items-start gap-2 px-4 py-3 rounded-lg"
      style={{
        maxWidth: '340px',
        backgroundColor: 'rgba(12, 12, 18, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span className="text-xs leading-relaxed" style={{ color: '#cccccc' }}>
        {t('betaBanner')}
      </span>
      <button
        onClick={() => {
          setVisible(false);
          try { localStorage.setItem(BETA_DISMISSED_KEY, '1'); } catch { /* noop */ }
        }}
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold cursor-pointer mt-0.5"
        style={{
          backgroundColor: 'rgba(179, 62, 62, 0.15)',
          color: '#b33e3e',
          border: '1px solid rgba(179, 62, 62, 0.3)',
        }}
      >
        X
      </button>
    </motion.div>
  );
}

// ----- Main Game Board -----

export default function GameBoard() {
  return (
    <GameScaleProvider>
      <GameBoardInner />
    </GameScaleProvider>
  );
}

function GameBoardInner() {
  const t = useTranslations();
  const dims = useGameScale();
  const visibleState = useGameStore((s) => s.visibleState);
  const gameOver = useGameStore((s) => s.gameOver);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const addAnimation = useGameStore((s) => s.addAnimation);
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const unpinCard = useUIStore((s) => s.unpinCard);
  const showFullscreenCard = useUIStore((s) => s.showFullscreenCard);

  const prevTurnRef = useRef<number | null>(null);

  // Lock scroll on both <html> and <body> while game board is mounted — prevents
  // Framer Motion layout animations from temporarily pushing content beyond
  // container bounds and triggering a scrollbar.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevMinHeight = body.style.minHeight;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.minHeight = 'unset';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.minHeight = prevMinHeight;
    };
  }, []);

  useEffect(() => {
    if (visibleState) {
      const currentTurn = visibleState.turn;
      if (prevTurnRef.current !== null && prevTurnRef.current !== currentTurn) {
        addAnimation({
          type: 'turn-transition',
          data: { turn: currentTurn },
        });
      }
      prevTurnRef.current = currentTurn;
    }
  }, [visibleState?.turn, addAnimation, visibleState]);

  // Clicking the board background unpins — but not when the fullscreen sheet is open
  // (mobile ghost-tap: when Details button disappears after tap, a synthetic click fires at
  //  the same coordinates and passes through the pointer-events-none backdrop to the board div)
  const handleBoardClick = useCallback(() => {
    if (pinnedCard && !showFullscreenCard) {
      unpinCard();
    }
  }, [pinnedCard, showFullscreenCard, unpinCard]);

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

  const { myState, opponentState, activeMissions } = visibleState;

  return (
    <div
      className="w-screen flex overflow-hidden no-select"
      style={{
        height: '100dvh',
        backgroundColor: "#0a0a0a",
        backgroundImage: "url(/images/bg-game.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        overscrollBehavior: "none",
      }}
      onClick={handleBoardClick}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
      />

      <BetaNotification />

      {/* Left side: Opponent deck + discard */}
      <OpponentSidePiles />

      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Opponent stats bar */}
        <OpponentStatsBar />

        {/* Opponent hand */}
        <section
          className="shrink-0 flex items-center justify-center py-1"
          style={{
            borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
            height: dims.opponentHandH + "px",
            backgroundColor: "rgba(8, 8, 12, 0.45)",
            backdropFilter: "blur(6px)",
          }}
        >
          <OpponentHand handSize={opponentState.handSize} />
        </section>

        {/* Mission area with ActionBar */}
        <section className="flex-1 flex flex-col min-h-0">
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
                      minWidth: dims.emptyLaneMinW + "px",
                      maxWidth: dims.emptyLaneMaxW + "px",
                      flex: "1 1 0",
                      backgroundColor: "rgba(10, 10, 10, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.03)",
                    }}
                  >
                    <div
                      className="rounded-lg mission-aspect flex items-center justify-center"
                      style={{
                        width: "100%",
                        maxWidth: dims.missionMaxW + "px",
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

          {/* ActionBar below missions */}
          <div className="shrink-0 flex justify-center py-0.5" style={{ pointerEvents: 'auto' }}>
            <ActionBar />
          </div>
        </section>

        {/* Player hand */}
        <section
          className="shrink-0 flex items-center justify-center"
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.03)",
            height: dims.playerHandH + "px",
            backgroundColor: "rgba(8, 8, 12, 0.45)",
            backdropFilter: "blur(6px)",
          }}
        >
          <PlayerHand hand={myState.hand} chakra={myState.chakra} />
        </section>

        {/* Player stats bar */}
        <PlayerStatsBar />
      </main>

      {/* Right side: Player deck + discard */}
      <PlayerSidePiles />

      <CardPreview />
      <FullscreenCardDetail />
      <MobileDetailsButton />

      <MulliganDialog />
      <GameLog />
      <AnimationController />
      <TargetSelector />
      <HandCardSelector />
      <EffectChoiceSelector />

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
