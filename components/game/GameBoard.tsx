"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { useGameStore } from "@/stores/gameStore";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
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
import { SandboxToolbar } from "./SandboxToolbar";
import { EdgeCoinFlip } from "./EdgeCoinFlip";
import { MissionDeckIntro } from "./MissionDeckIntro";
import { useSocketStore } from "@/lib/socket/client";
import { GameChat } from "./GameChat";
import { SpectatorBanner } from "./SpectatorBanner";



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
  const imagePath = normalizeImagePath(card.image_file);

  const rarityColor = rarityColorMap[card.rarity] ?? "#888888";

  return (
    <div
      className="overflow-hidden flex flex-col"
      style={{
        backgroundColor: "rgba(8, 8, 12, 0.95)",
        border: isMission
          ? `1px solid ${rankColorMap[missionContext?.rank ?? ""] ?? "rgba(196, 163, 90, 0.15)"}40`
          : "1px solid rgba(255, 255, 255, 0.08)",
        borderLeft: isMission
          ? `3px solid ${rankColorMap[missionContext?.rank ?? ""] ?? "rgba(196, 163, 90, 0.3)"}`
          : "3px solid rgba(196, 163, 90, 0.25)",
        boxShadow:
          "0 8px 40px rgba(0, 0, 0, 0.8)",
        maxHeight: "calc(100vh - 32px)",
      }}
    >
      
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

      
      <div
        className="p-3.5 flex flex-col gap-2 overflow-y-auto"
        style={{ maxHeight: "380px" }}
      >
        
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider"
            style={{
              backgroundColor: isMission
                ? "rgba(196, 163, 90, 0.12)"
                : "rgba(255, 255, 255, 0.04)",
              color: isMission ? "#c4a35a" : "#888888",
              borderLeft: `2px solid ${isMission ? "rgba(196, 163, 90, 0.4)" : "rgba(255, 255, 255, 0.1)"}`,
            }}
          >
            {isMission ? t("card.mission") : t("card.character")}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 shrink-0 font-bold"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              borderLeft: `2px solid ${rarityColor}`,
              color: rarityColor,
            }}
          >
            {card.rarity}
          </span>
        </div>

        
        <span
          className="text-sm font-bold leading-tight"
          style={{ color: "#e0e0e0" }}
        >
          {getCardName(card, locale as 'en' | 'fr')}
        </span>

        
        {isMission && card.name_en && locale !== 'en' && (
          <span className="text-xs -mt-1" style={{ color: "#666666" }}>
            {card.name_en}
          </span>
        )}

        
        {(card.title_fr || card.title_en) && (
          <span className="text-xs" style={{ color: "#999999" }}>
            {getCardTitle(card, locale as 'en' | 'fr')}
          </span>
        )}

        
        {isMission && missionContext && (
          <div
            className="flex flex-col gap-1.5 p-2.5 mt-0.5"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              borderLeft: `3px solid ${rankColorMap[missionContext.rank] ?? "#555"}`,
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
                className="text-sm font-bold px-2 py-0.5"
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

        
        {isMission && !missionContext && "basePoints" in card && (
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs" style={{ color: "#c4a35a" }}>
              {t("game.board.base")}: {(card as MissionCard).basePoints}{" "}
              {t("game.board.pts")}
            </span>
          </div>
        )}

        
        {isCharacter && (
          <div
            className="flex items-center gap-4 p-2 mt-0.5"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              borderLeft: "3px solid rgba(196, 163, 90, 0.3)",
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

        
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {card.keywords.map((kw) => (
              <span
                key={kw}
                className="text-[10px] px-1.5 py-0.5"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  color: "#999999",
                  borderLeft: "2px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                {getCardKeyword(kw, locale as 'en' | 'fr')}
              </span>
            ))}
          </div>
        )}

        
        {card.group && (
          <span className="text-[10px]" style={{ color: "#777777" }}>
            {t("collection.details.group")}: {getCardGroup(card.group, locale as 'en' | 'fr')}
          </span>
        )}

        
        <span className="text-[9px]" style={{ color: "#444444" }}>
          {card.id}
        </span>

        
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
                  className="flex flex-col gap-0.5 p-2"
                  style={{
                    backgroundColor: `${effectTypeColorMap[effect.type] ?? "#888888"}08`,
                    borderLeft: `3px solid ${effectTypeColorMap[effect.type] ?? "#888888"}`,
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
            className="text-[11px] font-medium px-3 py-1 cursor-pointer"
            style={{
              backgroundColor: "rgba(196, 163, 90, 0.12)",
              color: "#c4a35a",
              borderLeft: "3px solid rgba(196, 163, 90, 0.5)",
              transform: "skewX(-3deg)",
            }}
          >
            <span style={{ display: "inline-block", transform: "skewX(3deg)" }}>{t("card.fullscreen")}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              unpinCard();
            }}
            className="text-[11px] font-bold px-2.5 py-1 cursor-pointer"
            style={{
              backgroundColor: "rgba(179, 62, 62, 0.12)",
              color: "#b33e3e",
              borderLeft: "2px solid rgba(179, 62, 62, 0.5)",
            }}
          >
            X
          </button>
        </div>
      )}
    </div>
  );
}



function MobileDetailsButton() {
  const t = useTranslations();
  const dims = useGameScale();
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const showFullscreenCard = useUIStore((s) => s.showFullscreenCard);
  const toggleFullscreenCard = useUIStore((s) => s.toggleFullscreenCard);
  
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



function CardPreview() {
  const dims = useGameScale();
  const previewCard = useUIStore((s) => s.previewCard);
  const previewMissionContext = useUIStore((s) => s.previewMissionContext);
  const pinnedCard = useUIStore((s) => s.pinnedCard);
  const pinnedMissionContext = useUIStore((s) => s.pinnedMissionContext);

  const displayCard = pinnedCard ?? previewCard;
  const displayMissionContext = pinnedCard ? pinnedMissionContext : previewMissionContext;
  const isPinned = !!pinnedCard;

  
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



function FullscreenCardDetail() {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
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
  const imagePath = normalizeImagePath(card.image_file);

  const rarityColor = rarityColorMap[card.rarity] ?? "#888888";

  const handleClose = () => {
    toggleFullscreenCard();
    unpinCard();
  };

  
  const cardInfoContent = (
    <>
      
      <div className="flex items-center justify-between">
        <span
          className={`${dims.isMobile ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-bold uppercase tracking-wider`}
          style={{
            backgroundColor: isMission
              ? "rgba(196, 163, 90, 0.12)"
              : "rgba(255, 255, 255, 0.04)",
            color: isMission ? "#c4a35a" : "#888888",
            borderLeft: `2px solid ${isMission ? "rgba(196, 163, 90, 0.4)" : "rgba(255, 255, 255, 0.1)"}`,
          }}
        >
          {isMission ? t("card.mission") : t("card.character")}
        </span>
        <span
          className={`${dims.isMobile ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} shrink-0 font-bold`}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderLeft: `2px solid ${rarityColor}`,
            color: rarityColor,
          }}
        >
          {card.rarity}
        </span>
      </div>

      
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

      
      {isCharacter && (
        <div
          className={`flex items-center ${dims.isMobile ? 'gap-3 p-1.5' : 'gap-6 p-3'}`}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderLeft: "3px solid rgba(196, 163, 90, 0.3)",
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

      
      {isMission && missionContext && (
        <div
          className={`flex flex-col gap-1 ${dims.isMobile ? 'p-1.5' : 'p-3'}`}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderLeft: `3px solid ${rankColorMap[missionContext.rank] ?? "#555"}`,
          }}
        >
          <div className="flex items-center justify-between">
            <span className={`${dims.isMobile ? 'text-[10px]' : 'text-sm'}`} style={{ color: "#aaaaaa" }}>
              {t("card.rank")}
            </span>
            <span
              className={`${dims.isMobile ? 'text-xs px-2 py-0.5' : 'text-base px-3 py-1'} font-bold`}
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

      
      {isMission && !missionContext && "basePoints" in card && (
        <span className="text-xs" style={{ color: "#c4a35a" }}>
          {t("game.board.base")}: {(card as MissionCard).basePoints} {t("game.board.pts")}
        </span>
      )}

      
      {card.keywords && card.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.keywords.map((kw) => (
            <span
              key={kw}
              className={`${dims.isMobile ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                color: "#999999",
                borderLeft: "2px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              {getCardKeyword(kw, locale as 'en' | 'fr')}
            </span>
          ))}
        </div>
      )}

      
      {card.group && (
        <span className={`${dims.isMobile ? 'text-[10px]' : 'text-sm'}`} style={{ color: "#999999" }}>
          {getCardGroup(card.group, locale as 'en' | 'fr')}
        </span>
      )}

      
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
                className={`flex flex-col gap-0.5 ${dims.isMobile ? 'p-1.5' : 'p-3'}`}
                style={{
                  backgroundColor: `${effectTypeColorMap[effect.type] ?? "#888888"}08`,
                  borderLeft: `3px solid ${effectTypeColorMap[effect.type] ?? "#888888"}`,
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

  
  if (dims.isMobile) {
    return (
      <>
        
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", zIndex: 299 }}
        />
        
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="fixed bottom-0 left-0 right-0 flex flex-col overflow-hidden"
          style={{
            zIndex: 300,
            maxHeight: "80vh",
            backgroundColor: "rgba(10, 10, 14, 0.98)",
            borderTop: "2px solid rgba(196, 163, 90, 0.25)",
            boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.7)",
          }}
        >
          
          <button
            onClick={() => toggleFullscreenCard()}
            className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center text-[11px] font-bold cursor-pointer"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              color: "#888888",
              borderLeft: "2px solid rgba(255, 255, 255, 0.15)",
            }}
          >
            X
          </button>

          
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

          
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {cardInfoContent}
          </div>
        </motion.div>
      </>
    );
  }

  
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
          className="relative flex flex-col overflow-hidden"
          style={{
            maxWidth: isMission ? "500px" : "400px",
            width: "90vw",
            maxHeight: "90vh",
            backgroundColor: "rgba(10, 10, 14, 0.98)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            boxShadow: "0 20px 80px rgba(0, 0, 0, 0.9)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          
          <div className="absolute top-0 left-0 w-6 h-6 pointer-events-none" style={{ borderTop: '2px solid rgba(196, 163, 90, 0.5)', borderLeft: '2px solid rgba(196, 163, 90, 0.5)' }} />
          <div className="absolute top-0 right-0 w-6 h-6 pointer-events-none" style={{ borderTop: '2px solid rgba(196, 163, 90, 0.5)', borderRight: '2px solid rgba(196, 163, 90, 0.5)' }} />
          <div className="absolute bottom-0 left-0 w-6 h-6 pointer-events-none" style={{ borderBottom: '2px solid rgba(196, 163, 90, 0.5)', borderLeft: '2px solid rgba(196, 163, 90, 0.5)' }} />
          <div className="absolute bottom-0 right-0 w-6 h-6 pointer-events-none" style={{ borderBottom: '2px solid rgba(196, 163, 90, 0.5)', borderRight: '2px solid rgba(196, 163, 90, 0.5)' }} />

          
          <button
            onClick={handleClose}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-5 h-8 flex items-center justify-center text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              color: "#888888",
              border: "1px solid rgba(255, 255, 255, 0.15)",
            }}
          >
            X
          </button>

          
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



function MaintenanceNotification() {
  const t = useTranslations('common');
  const socketWarning = useSocketStore((s) => s.maintenanceWarning);
  const [apiWarning, setApiWarning] = useState(false);

  
  useEffect(() => {
    if (socketWarning) return;
    fetch('/api/admin/maintenance')
      .then((r) => { if (r.ok) return r.json(); return null; })
      .then((data) => { if (data?.active) setApiWarning(true); })
      .catch(() => {});
  }, [socketWarning]);

  if (!socketWarning && !apiWarning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed top-14 right-3 z-300 flex items-start gap-2 px-4 py-3"
      style={{
        maxWidth: '340px',
        backgroundColor: 'rgba(40, 30, 10, 0.92)',
        borderLeft: '3px solid rgba(196, 163, 90, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      }}
    >
      <span className="text-[9px] leading-relaxed" style={{ color: '#c4a35a', fontFamily: 'Inter, sans-serif' }}>
        {t('maintenanceBanner')}
      </span>
    </motion.div>
  );
}



const BETA_DISMISSED_KEY = 'naruto-mythos-beta-dismissed';

function BetaNotification() {
  const t = useTranslations('home');
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
      className="fixed top-3 right-3 z-300 flex items-start gap-2 px-4 py-3"
      style={{
        maxWidth: '340px',
        backgroundColor: 'rgba(12, 12, 18, 0.92)',
        borderLeft: '3px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      }}
    >
      <span className="text-[9px] leading-relaxed" style={{ color: '#cccccc', fontFamily: 'Inter, sans-serif' }}>
        {t('betaBanner')}
      </span>
      <button
        onClick={() => {
          setVisible(false);
          try { localStorage.setItem(BETA_DISMISSED_KEY, '1'); } catch { /* noop */ }
        }}
        className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-bold cursor-pointer mt-0.5"
        style={{
          backgroundColor: 'rgba(179, 62, 62, 0.15)',
          color: '#b33e3e',
          borderLeft: '2px solid rgba(179, 62, 62, 0.4)',
        }}
      >
        X
      </button>
    </motion.div>
  );
}



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
  const gameBackgroundUrl = useSettingsStore((s) => s.gameBackgroundUrl);
  const fetchSettings = useSettingsStore((s) => s.fetchFromServer);
  const isSpectating = useSocketStore((s) => s.isSpectating);

  
  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const prevTurnRef = useRef<number | null>(null);

  
  
  
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
      className="flex overflow-hidden no-select"
      style={{
        width: 'var(--game-board-w, 100vw)',
        height: 'var(--game-board-h, 100dvh)',
        backgroundColor: "#0a0a0a",
        backgroundImage: `url(${gameBackgroundUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        overscrollBehavior: "none",
        paddingTop: isSpectating ? 36 : 0,
      }}
      onClick={handleBoardClick}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
      />

      <MaintenanceNotification />
      <BetaNotification />
      <SandboxToolbar />

      
      <OpponentSidePiles />

      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        
        <OpponentStatsBar />

        
        <section
          className="shrink-0 flex items-center justify-center"
          style={{
            borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
            height: dims.opponentHandH + "px",
            backgroundColor: "rgba(8, 8, 12, 0.5)",
            padding: dims.isMobile ? '0' : '4px 0',
          }}
        >
          <OpponentHand handSize={opponentState.handSize} />
        </section>

        
        <section className="flex-1 flex flex-col min-h-0">
          <div className={`flex-1 flex items-stretch justify-center ${dims.isMobile ? 'px-1 py-0' : 'px-3 py-0.5'} min-h-0 overflow-hidden`}>
            <div className={`flex ${dims.isMobile ? 'gap-0.5' : 'gap-1.5'} items-stretch justify-center w-full`}>
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
                    className="flex flex-col items-center justify-center"
                    style={{
                      minWidth: dims.emptyLaneMinW + "px",
                      maxWidth: dims.emptyLaneMaxW + "px",
                      flex: "1 1 0",
                      backgroundColor: "rgba(10, 10, 10, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.03)",
                    }}
                  >
                    <div
                      className="mission-aspect flex items-center justify-center"
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

          
          <div className="shrink-0 flex justify-center py-0.5" style={{ pointerEvents: 'auto' }}>
            <ActionBar />
          </div>
        </section>

        
        <section
          className="shrink-0 flex items-end justify-center"
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.04)",
            height: dims.playerHandH + "px",
            backgroundColor: "rgba(8, 8, 12, 0.5)",
            paddingBottom: dims.isMobile ? '2px' : '0',
          }}
        >
          {isSpectating
            ? <OpponentHand handSize={(myState as any).handSize ?? myState.hand.length} />
            : <PlayerHand hand={myState.hand} chakra={myState.chakra} />
          }
        </section>

        
        <PlayerStatsBar />
      </main>

      
      <PlayerSidePiles />

      <CardPreview />
      <FullscreenCardDetail />
      <MobileDetailsButton />

      <EdgeCoinFlip />
      <MissionDeckIntro />
      <SpectatorBanner />
      <MulliganDialog />
      <GameLog />
      <GameChat />
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
            className="fixed top-3 left-1/2 -translate-x-1/2 z-30 py-1.5 px-4"
            style={{
              backgroundColor: "rgba(10, 10, 14, 0.85)",
              borderLeft: "3px solid rgba(196, 163, 90, 0.3)",
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
