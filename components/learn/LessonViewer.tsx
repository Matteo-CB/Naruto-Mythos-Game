'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

// ---------------------
// Constants
// ---------------------
const TOTAL_LESSONS = 8;

const CARD_IMAGES = {
  narutoRare: '/images/rare/108-130_NARUTO_UZUMAKI.webp',
  narutoCommon: '/images/common/009-130_NARUTO_UZUMAKI.webp',
  orochimaru: '/images/common/050-130_OROCHIMARU.webp',
  missionSupport: '/images/mission/MSS_01_Appel_de_soutien.webp',
  missionChunin: '/images/mission/MSS_02_Examen_Ch\u00FBnin.webp',
  cardBack: '/images/card-back.png',
  scrollKunai: '/images/icons/scroll-kunai.png',
  shuriken: '/images/icons/shuriken.png',
  kunai: '/images/icons/kunai.png',
  cloud: '/images/icons/cloud-2.png',
} as const;

// ---------------------
// Slide direction variants for lesson transitions
// ---------------------
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
};

// ---------------------
// Reusable inline info panel (replaces floating LessonBubble)
// ---------------------
function InfoPanel({
  title,
  description,
  delay = 0,
  color = '#c4a35a',
}: {
  title: string;
  description: string;
  delay?: number;
  color?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{
        padding: '14px 18px',
        backgroundColor: 'rgba(10, 10, 14, 0.85)',
        border: `1px solid ${color}30`,
        borderRadius: '8px',
      }}
    >
      <div
        style={{
          color,
          fontSize: '0.95rem',
          fontWeight: 700,
          lineHeight: 1.35,
          marginBottom: '6px',
        }}
      >
        {title}
      </div>
      <div style={{ color: '#cccccc', fontSize: '0.85rem', lineHeight: 1.6 }}>
        {description}
      </div>
    </motion.div>
  );
}

// ---------------------
// Lesson scene components
// ---------------------

function LessonOverview({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '28px',
      }}
    >
      {/* Two cards facing each other */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <motion.div
          initial={{ x: -40, opacity: 0, rotate: -8 }}
          animate={{ x: 0, opacity: 1, rotate: -8 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Image
            src={CARD_IMAGES.narutoRare}
            alt="Naruto Uzumaki"
            width={110}
            height={154}
            className="w-[90px] h-[126px] sm:w-[110px] sm:h-[154px]"
            style={{
              borderRadius: '8px',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.6)',
            }}
          />
        </motion.div>

        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          style={{ color: '#c4a35a', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.1em' }}
        >
          VS
        </motion.div>

        <motion.div
          initial={{ x: 40, opacity: 0, rotate: 8 }}
          animate={{ x: 0, opacity: 1, rotate: 8 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Image
            src={CARD_IMAGES.orochimaru}
            alt="Orochimaru"
            width={110}
            height={154}
            className="w-[90px] h-[126px] sm:w-[110px] sm:h-[154px]"
            style={{
              borderRadius: '8px',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.6)',
            }}
          />
        </motion.div>
      </div>

      {/* Info panels below */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
          maxWidth: '540px',
          width: '100%',
        }}
      >
        <InfoPanel
          title={t('tutorial.lessons.overview.bubble1Title')}
          description={t('tutorial.lessons.overview.bubble1')}
          delay={0.6}
        />
        <InfoPanel
          title={t('tutorial.lessons.overview.bubble2Title')}
          description={t('tutorial.lessons.overview.bubble2')}
          delay={0.7}
        />
        <InfoPanel
          title={t('tutorial.lessons.overview.bubble3Title')}
          description={t('tutorial.lessons.overview.bubble3')}
          delay={0.8}
        />
      </div>
    </div>
  );
}

function LessonCardAnatomy({ t }: { t: ReturnType<typeof useTranslations> }) {
  const ANNOTATIONS = [
    { id: 1, titleKey: 'nameTitle', descKey: 'nameBubble', top: '12%', left: '50%', color: '#c4a35a' },
    { id: 2, titleKey: 'titleTitle', descKey: 'titleBubble', top: '18%', left: '50%', color: '#d4b76a' },
    { id: 3, titleKey: 'chakraTitle', descKey: 'chakraBubble', top: '27%', left: '14%', color: '#5a8bbf' },
    { id: 4, titleKey: 'powerTitle', descKey: 'powerBubble', top: '27%', left: '86%', color: '#b33e3e' },
    { id: 5, titleKey: 'effectsTitle', descKey: 'effectsBubble', top: '80%', left: '50%', color: '#3e8b3e' },
    { id: 6, titleKey: 'rarityTitle', descKey: 'rarityBubble', top: '93%', left: '10%', color: '#6a6abb' },
  ];

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '28px',
      }}
    >
      {/* Card with numbered annotation dots */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <Image
          src={CARD_IMAGES.narutoRare}
          alt="Naruto Uzumaki"
          width={200}
          height={280}
          className="w-[180px] h-[252px] sm:w-[200px] sm:h-[280px]"
          style={{
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
          }}
        />

        {/* Numbered circles overlaid on the card */}
        {ANNOTATIONS.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
            style={{
              position: 'absolute',
              top: a.top,
              left: a.left,
              transform: 'translate(-50%, -50%)',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              backgroundColor: a.color,
              color: '#0a0a0a',
              fontSize: '0.88rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              boxShadow: `0 0 8px ${a.color}80`,
              zIndex: 5,
            }}
          >
            {a.id}
          </motion.div>
        ))}
      </motion.div>

      {/* Annotation legend below the card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
          maxWidth: '540px',
          width: '100%',
        }}
      >
        {ANNOTATIONS.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.7 + i * 0.08 }}
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              padding: '8px 10px',
              backgroundColor: 'rgba(17, 17, 17, 0.7)',
              border: `1px solid ${a.color}30`,
              borderRadius: '6px',
            }}
          >
            {/* Matching numbered circle */}
            <span
              style={{
                width: '20px',
                height: '20px',
                minWidth: '20px',
                borderRadius: '50%',
                backgroundColor: a.color,
                color: '#0a0a0a',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '1px',
              }}
            >
              {a.id}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: a.color,
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  lineHeight: 1.35,
                  marginBottom: '4px',
                }}
              >
                {t(`tutorial.lessons.cardAnatomy.${a.titleKey}` as Parameters<typeof t>[0])}
              </div>
              <div
                style={{
                  color: '#cccccc',
                  fontSize: '0.82rem',
                  lineHeight: 1.55,
                }}
              >
                {t(`tutorial.lessons.cardAnatomy.${a.descKey}` as Parameters<typeof t>[0])}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function LessonTurnStructure({ t }: { t: ReturnType<typeof useTranslations> }) {
  const phases = ['start', 'action', 'mission', 'end'] as const;

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '24px',
      }}
    >
      {/* Phase boxes in a row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {phases.map((phase, index) => (
          <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 + index * 0.15 }}
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(10, 10, 14, 0.92)',
                border: '1px solid rgba(196, 163, 90, 0.4)',
                borderRadius: '8px',
                textAlign: 'center',
                minWidth: '80px',
              }}
            >
              <div
                style={{
                  color: '#c4a35a',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '2px',
                }}
              >
                {t(`tutorial.lessons.turnStructure.phase${index + 1}Label`)}
              </div>
              <div style={{ color: '#999999', fontSize: '0.8rem', lineHeight: 1.3 }}>
                {t(`tutorial.lessons.turnStructure.phase${index + 1}Name`)}
              </div>
            </motion.div>

            {index < phases.length - 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + index * 0.15 }}
                style={{ color: '#c4a35a', fontSize: '1.1rem', fontWeight: 300, userSelect: 'none' }}
              >
                {'>'}
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* Phase descriptions below */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
          maxWidth: '540px',
          width: '100%',
        }}
      >
        {phases.map((phase, index) => (
          <InfoPanel
            key={phase}
            title={t(`tutorial.lessons.turnStructure.phase${index + 1}Name`)}
            description={t(`tutorial.lessons.turnStructure.${phase}`)}
            delay={0.7 + index * 0.1}
          />
        ))}
      </div>
    </div>
  );
}

function LessonPlayingCards({ t }: { t: ReturnType<typeof useTranslations> }) {
  const modes = [
    { key: 'visible', image: CARD_IMAGES.narutoRare },
    { key: 'hidden', image: CARD_IMAGES.cardBack },
    { key: 'reveal', image: null },
  ] as const;

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '24px',
      }}
    >
      {/* Three modes with card + description together */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '600px',
        }}
      >
        {modes.map((mode, index) => (
          <motion.div
            key={mode.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + index * 0.2 }}
            style={{
              flex: '1 1 160px',
              maxWidth: '190px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              padding: '14px 10px',
              backgroundColor: 'rgba(10, 10, 14, 0.85)',
              border: '1px solid rgba(196, 163, 90, 0.2)',
              borderRadius: '8px',
            }}
          >
            {/* Card visual */}
            {mode.key === 'reveal' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '80px' }}>
                <Image
                  src={CARD_IMAGES.cardBack}
                  alt=""
                  width={40}
                  height={56}
                  style={{ borderRadius: '4px', opacity: 0.5 }}
                />
                <span style={{ color: '#c4a35a', fontSize: '1rem', fontWeight: 300 }}>{'>'}</span>
                <Image
                  src={CARD_IMAGES.narutoRare}
                  alt=""
                  width={40}
                  height={56}
                  style={{ borderRadius: '4px', boxShadow: '0 2px 8px rgba(196,163,90,0.3)' }}
                />
              </div>
            ) : (
              <Image
                src={mode.image}
                alt=""
                width={70}
                height={98}
                style={{
                  borderRadius: '6px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
                  height: '80px',
                  width: 'auto',
                }}
              />
            )}

            {/* Label */}
            <span
              style={{
                color: '#c4a35a',
                fontSize: '0.88rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t(`tutorial.lessons.playingCards.${mode.key}Label`)}
            </span>

            {/* Description */}
            <div style={{ color: '#cccccc', fontSize: '0.88rem', lineHeight: 1.55, textAlign: 'center' }}>
              {t(`tutorial.lessons.playingCards.${mode.key}Bubble`)}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function LessonMissions({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '24px',
      }}
    >
      {/* Two mission cards */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <motion.div
          initial={{ opacity: 0, rotate: -4 }}
          animate={{ opacity: 1, rotate: -4 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Image
            src={CARD_IMAGES.missionSupport}
            alt="Mission: Call for Support"
            width={130}
            height={94}
            style={{ borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, rotate: 4 }}
          animate={{ opacity: 1, rotate: 4 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Image
            src={CARD_IMAGES.missionChunin}
            alt="Mission: Chunin Exam"
            width={130}
            height={94}
            style={{ borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
          />
        </motion.div>
      </div>

      {/* Info grid below */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
          maxWidth: '540px',
          width: '100%',
        }}
      >
        <InfoPanel
          title={t('tutorial.lessons.missions.ranksTitle')}
          description={t('tutorial.lessons.missions.ranksBubble')}
          delay={0.5}
        />
        <InfoPanel
          title={t('tutorial.lessons.missions.bonusTitle')}
          description={t('tutorial.lessons.missions.bonusBubble')}
          delay={0.6}
        />
        <InfoPanel
          title={t('tutorial.lessons.missions.powerTitle')}
          description={t('tutorial.lessons.missions.powerBubble')}
          delay={0.7}
        />
        <InfoPanel
          title={t('tutorial.lessons.missions.edgeTitle')}
          description={t('tutorial.lessons.missions.edgeBubble')}
          delay={0.8}
        />
      </div>
    </div>
  );
}

function LessonUpgrade({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '24px',
      }}
    >
      {/* Stacked cards to show upgrade */}
      <div style={{ position: 'relative', width: '140px', height: '170px' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 0.6, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{ position: 'absolute', bottom: 0, left: 0, zIndex: 1 }}
        >
          <Image
            src={CARD_IMAGES.orochimaru}
            alt="Lower cost"
            width={100}
            height={140}
            style={{
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              filter: 'brightness(0.6)',
            }}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: -40, x: 30 }}
          animate={{ opacity: 1, y: 0, x: 20 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          style={{ position: 'absolute', top: 0, left: 20, zIndex: 2 }}
        >
          <Image
            src={CARD_IMAGES.narutoRare}
            alt="Higher cost"
            width={100}
            height={140}
            style={{
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(196, 163, 90, 0.3)',
            }}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.8 }}
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-10px',
            zIndex: 3,
            color: '#c4a35a',
            fontSize: '1.6rem',
            fontWeight: 700,
          }}
        >
          +
        </motion.div>
      </div>

      {/* Info grid below */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
          maxWidth: '540px',
          width: '100%',
        }}
      >
        <InfoPanel
          title={t('tutorial.lessons.upgrade.sameNameTitle')}
          description={t('tutorial.lessons.upgrade.sameNameBubble')}
          delay={0.6}
        />
        <InfoPanel
          title={t('tutorial.lessons.upgrade.costTitle')}
          description={t('tutorial.lessons.upgrade.costBubble')}
          delay={0.7}
        />
        <InfoPanel
          title={t('tutorial.lessons.upgrade.effectsTitle')}
          description={t('tutorial.lessons.upgrade.effectsBubble')}
          delay={0.8}
        />
        <InfoPanel
          title={t('tutorial.lessons.upgrade.tokensTitle')}
          description={t('tutorial.lessons.upgrade.tokensBubble')}
          delay={0.9}
        />
      </div>
    </div>
  );
}

function LessonSpecialMechanics({ t }: { t: ReturnType<typeof useTranslations> }) {
  const sections = [
    { key: 'edge', image: CARD_IMAGES.shuriken, titleKey: 'edgeTitle', descKey: 'edgeDesc' },
    { key: 'tokens', image: CARD_IMAGES.shuriken, titleKey: 'tokensTitle', descKey: 'tokensDesc' },
    { key: 'deck', image: CARD_IMAGES.shuriken, titleKey: 'deckTitle', descKey: 'deckDesc' },
  ] as const;

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '20px',
      }}
    >
      {/* Three info cards */}
      <div
        style={{
          display: 'flex',
          gap: '14px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '600px',
        }}
      >
        {sections.map((s, i) => (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.2 }}
            style={{
              flex: '1 1 160px',
              padding: '16px',
              backgroundColor: 'rgba(10, 10, 14, 0.85)',
              border: '1px solid rgba(196, 163, 90, 0.25)',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <Image
              src={s.image}
              alt=""
              width={32}
              height={32}
              style={{ margin: '0 auto 8px', opacity: 0.5 }}
            />
            <div style={{ color: '#c4a35a', fontSize: '0.92rem', fontWeight: 700, marginBottom: '6px' }}>
              {t(`tutorial.lessons.special.${s.titleKey}` as Parameters<typeof t>[0])}
            </div>
            <div style={{ color: '#cccccc', fontSize: '0.88rem', lineHeight: 1.55 }}>
              {t(`tutorial.lessons.special.${s.descKey}` as Parameters<typeof t>[0])}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pro tip inline */}
      <InfoPanel
        title={t('tutorial.lessons.special.tipsTitle')}
        description={t('tutorial.lessons.special.tipsBubble')}
        delay={0.8}
      />
    </div>
  );
}

// ---------------------
// Lesson 8: Play a Full Game (guided 1-turn walkthrough)
// ---------------------
function LessonGameplay({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [step, setStep] = useState(0);
  const TOTAL_STEPS = 8;

  const goNextStep = useCallback(() => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }, [step]);

  const goPrevStep = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  // Helper to render the explanation panel below visual content
  const stepInfo = (titleKey: string, descKey: string, delay: number) => (
    <InfoPanel
      title={t(`tutorial.lessons.gameplay.${titleKey}` as Parameters<typeof t>[0])}
      description={t(`tutorial.lessons.gameplay.${descKey}` as Parameters<typeof t>[0])}
      delay={delay}
    />
  );

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '16px',
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          style={{
            width: '100%',
            maxWidth: '540px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          {/* Step 0: Setup */}
          {step === 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                >
                  <div style={{ position: 'relative', width: '80px', height: '112px' }}>
                    {[0, 1, 2].map((i) => (
                      <Image key={i} src={CARD_IMAGES.cardBack} alt="" width={80} height={112}
                        style={{ position: 'absolute', top: i * -3, left: i * 2, borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} />
                    ))}
                  </div>
                  <span style={{ color: '#888', fontSize: '0.82rem', fontWeight: 600 }}>
                    {t('tutorial.lessons.gameplay.deckLabel')}
                  </span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  style={{ display: 'flex', alignItems: 'flex-end', position: 'relative', width: '180px', height: '120px' }}
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Image key={i} src={CARD_IMAGES.cardBack} alt="" width={55} height={77}
                      style={{ position: 'absolute', left: `${i * 28}px`, bottom: `${Math.abs(i - 2) * 4}px`, transform: `rotate(${(i - 2) * 6}deg)`, borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
                  ))}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                >
                  <div style={{ position: 'relative', width: '90px', height: '65px' }}>
                    {[0, 1].map((i) => (
                      <Image key={i} src={CARD_IMAGES.cardBack} alt="" width={90} height={65}
                        style={{ position: 'absolute', top: i * -2, left: i * 2, borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} />
                    ))}
                  </div>
                  <span style={{ color: '#888', fontSize: '0.82rem', fontWeight: 600 }}>
                    {t('tutorial.lessons.gameplay.missionDeckLabel')}
                  </span>
                </motion.div>
              </div>
              {stepInfo('step0Title', 'step0Bubble', 0.6)}
            </>
          )}

          {/* Step 1: Start Phase - Mission Reveal */}
          {step === 1 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <motion.div initial={{ rotateY: 180, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }} style={{ perspective: '600px' }}>
                  <Image src={CARD_IMAGES.missionChunin} alt="Chunin Exam Mission" width={160} height={116}
                    style={{ borderRadius: '8px', boxShadow: '0 4px 24px rgba(196, 163, 90, 0.3)' }} />
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }}
                  style={{ padding: '6px 16px', backgroundColor: 'rgba(196, 163, 90, 0.15)', border: '1px solid rgba(196, 163, 90, 0.3)', borderRadius: '6px', color: '#c4a35a', fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                  {t('tutorial.lessons.gameplay.rankD')}
                </motion.div>
              </div>
              {stepInfo('step1Title', 'step1Bubble', 0.8)}
            </>
          )}

          {/* Step 2: Start Phase - Chakra & Draw */}
          {step === 2 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid rgba(196, 163, 90, 0.5)', backgroundColor: 'rgba(10, 10, 14, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ color: '#c4a35a', fontSize: '1.5rem', fontWeight: 700 }}>5</motion.span>
                    <span style={{ color: '#888', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>{t('tutorial.lessons.gameplay.chakraLabel')}</span>
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.4 }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Image src={CARD_IMAGES.cardBack} alt="" width={55} height={77} style={{ borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
                  <Image src={CARD_IMAGES.cardBack} alt="" width={55} height={77} style={{ borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
                  <span style={{ color: '#c4a35a', fontSize: '0.92rem', fontWeight: 600, marginLeft: '8px' }}>+2</span>
                </motion.div>
              </div>
              {stepInfo('step2Title', 'step2Bubble', 0.6)}
            </>
          )}

          {/* Step 3: Action Phase - Play Character */}
          {step === 3 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.div initial={{ y: 60, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 200 }}>
                  <Image src={CARD_IMAGES.narutoCommon} alt="Naruto Uzumaki" width={100} height={140} style={{ borderRadius: '8px', boxShadow: '0 8px 32px rgba(196, 163, 90, 0.3)' }} />
                </motion.div>
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ color: '#c4a35a', fontSize: '1.2rem', fontWeight: 300 }}>{'>'}</motion.span>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }}>
                  <Image src={CARD_IMAGES.missionChunin} alt="Mission" width={120} height={87} style={{ borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }} />
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }}
                  style={{ padding: '8px 14px', backgroundColor: 'rgba(10, 10, 14, 0.9)', border: '1px solid rgba(196, 163, 90, 0.3)', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span style={{ color: '#c4a35a', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>{t('tutorial.lessons.gameplay.chakraLabel')}</span>
                  <span style={{ color: '#cc6666', fontSize: '0.9rem', fontWeight: 700 }}>5 {'>'} 2</span>
                </motion.div>
              </div>
              {stepInfo('step3Title', 'step3Bubble', 0.8)}
            </>
          )}

          {/* Step 4: Action Phase - Opponent Plays Hidden */}
          {step === 4 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 200 }}>
                  <Image src={CARD_IMAGES.cardBack} alt="Hidden character" width={100} height={140} style={{ borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }} />
                </motion.div>
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ color: '#c4a35a', fontSize: '1.2rem', fontWeight: 300 }}>{'>'}</motion.span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Image src={CARD_IMAGES.missionChunin} alt="Mission" width={100} height={73} style={{ borderRadius: '6px', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }} />
                  <Image src={CARD_IMAGES.narutoCommon} alt="Naruto (yours)" width={50} height={70} style={{ borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', opacity: 0.8 }} />
                </div>
                <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }}
                  style={{ padding: '8px 14px', backgroundColor: 'rgba(10, 10, 14, 0.9)', border: '1px solid rgba(196, 163, 90, 0.3)', borderRadius: '6px', textAlign: 'center' }}>
                  <span style={{ color: '#888', fontSize: '0.82rem', fontWeight: 600 }}>{t('tutorial.lessons.gameplay.costLabel')}</span>
                  <div style={{ color: '#c4a35a', fontSize: '1rem', fontWeight: 700 }}>1 {t('tutorial.lessons.gameplay.chakraLabel')}</div>
                </motion.div>
              </div>
              {stepInfo('step4Title', 'step4Bubble', 0.7)}
            </>
          )}

          {/* Step 5: Action Phase - Both Pass */}
          {step === 5 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.2 }}
                  style={{ padding: '16px 28px', backgroundColor: 'rgba(10, 10, 14, 0.9)', border: '1px solid rgba(196, 163, 90, 0.4)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#888', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' }}>{t('tutorial.lessons.gameplay.youLabel')}</div>
                  <div style={{ color: '#c4a35a', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.1em' }}>PASS</div>
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <Image src={CARD_IMAGES.shuriken} alt="" width={36} height={36} style={{ opacity: 0.7 }} />
                  <span style={{ color: '#c4a35a', fontSize: '0.8rem', fontWeight: 600 }}>{t('tutorial.lessons.gameplay.edgeLabel')}</span>
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.4 }}
                  style={{ padding: '16px 28px', backgroundColor: 'rgba(10, 10, 14, 0.9)', border: '1px solid rgba(196, 163, 90, 0.4)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#888', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' }}>{t('tutorial.lessons.gameplay.oppLabel')}</div>
                  <div style={{ color: '#c4a35a', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.1em' }}>PASS</div>
                </motion.div>
              </div>
              {stepInfo('step5Title', 'step5Bubble', 0.7)}
            </>
          )}

          {/* Step 6: Mission Phase - Scoring */}
          {step === 6 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.2 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <Image src={CARD_IMAGES.narutoCommon} alt="Naruto" width={70} height={98} style={{ borderRadius: '6px', boxShadow: '0 4px 20px rgba(196, 163, 90, 0.4)' }} />
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 }}
                    style={{ padding: '3px 12px', backgroundColor: 'rgba(100, 180, 100, 0.2)', border: '1px solid rgba(100, 180, 100, 0.5)', borderRadius: '4px', color: '#8fc98f', fontSize: '0.8rem', fontWeight: 700 }}>
                    PWR 3
                  </motion.div>
                </motion.div>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 }} style={{ color: '#c4a35a', fontSize: '1.1rem', fontWeight: 700 }}>VS</motion.div>
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.2 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <Image src={CARD_IMAGES.cardBack} alt="Hidden" width={70} height={98} style={{ borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', opacity: 0.7 }} />
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 }}
                    style={{ padding: '3px 12px', backgroundColor: 'rgba(180, 80, 80, 0.2)', border: '1px solid rgba(180, 80, 80, 0.5)', borderRadius: '4px', color: '#cc6666', fontSize: '0.8rem', fontWeight: 700 }}>
                    PWR 0
                  </motion.div>
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }}
                  style={{ padding: '10px 18px', backgroundColor: 'rgba(100, 180, 100, 0.15)', border: '1px solid rgba(100, 180, 100, 0.4)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#8fc98f', fontSize: '1.1rem', fontWeight: 700 }}>+1</div>
                  <div style={{ color: '#888', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>{t('tutorial.lessons.gameplay.pointsLabel')}</div>
                </motion.div>
              </div>
              {stepInfo('step6Title', 'step6Bubble', 0.9)}
            </>
          )}

          {/* Step 7: End Phase */}
          {step === 7 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
                  style={{ padding: '16px 20px', backgroundColor: 'rgba(10, 10, 14, 0.9)', border: '1px solid rgba(196, 163, 90, 0.25)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#888', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>{t('tutorial.lessons.gameplay.chakraLabel')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <span style={{ color: '#cc6666', fontSize: '1.1rem', fontWeight: 700, textDecoration: 'line-through' }}>2</span>
                    <span style={{ color: '#c4a35a', fontSize: '1rem', fontWeight: 300 }}>{'>'}</span>
                    <span style={{ color: '#c4a35a', fontSize: '1.1rem', fontWeight: 700 }}>0</span>
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}
                  style={{ padding: '16px 20px', backgroundColor: 'rgba(10, 10, 14, 0.9)', border: '1px solid rgba(196, 163, 90, 0.25)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#888', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>{t('tutorial.lessons.gameplay.tokensLabel')}</div>
                  <div style={{ color: '#cc6666', fontSize: '0.8rem', fontWeight: 600 }}>{t('tutorial.lessons.gameplay.removedLabel')}</div>
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }}
                  style={{ padding: '16px 24px', backgroundColor: 'rgba(196, 163, 90, 0.1)', border: '1px solid rgba(196, 163, 90, 0.4)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#c4a35a', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.05em' }}>{t('tutorial.lessons.gameplay.nextTurnLabel')}</div>
                </motion.div>
              </div>
              {stepInfo('step7Title', 'step7Bubble', 0.8)}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Step navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={goPrevStep}
          disabled={step === 0}
          style={{
            padding: '5px 14px',
            backgroundColor: step === 0 ? '#1a1a1a' : 'transparent',
            border: step === 0 ? '1px solid #2a2a2a' : '1px solid rgba(196, 163, 90, 0.4)',
            borderRadius: '4px',
            color: step === 0 ? '#444' : '#c4a35a',
            fontSize: '0.88rem',
            fontWeight: 600,
            cursor: step === 0 ? 'default' : 'pointer',
          }}
        >
          {'<'}
        </button>
        <span style={{ color: '#666', fontSize: '0.88rem', fontWeight: 500 }}>
          {step + 1} / {TOTAL_STEPS}
        </span>
        <button
          onClick={goNextStep}
          disabled={step === TOTAL_STEPS - 1}
          style={{
            padding: '5px 14px',
            backgroundColor: step === TOTAL_STEPS - 1 ? '#1a1a1a' : 'transparent',
            border: step === TOTAL_STEPS - 1 ? '1px solid #2a2a2a' : '1px solid rgba(196, 163, 90, 0.4)',
            borderRadius: '4px',
            color: step === TOTAL_STEPS - 1 ? '#444' : '#c4a35a',
            fontSize: '0.88rem',
            fontWeight: 600,
            cursor: step === TOTAL_STEPS - 1 ? 'default' : 'pointer',
          }}
        >
          {'>'}
        </button>
      </div>
    </div>
  );
}

// ---------------------
// Main component: LessonViewer
// ---------------------
export function LessonViewer() {
  const t = useTranslations('learn');
  const [currentLesson, setCurrentLesson] = useState(0);
  const [direction, setDirection] = useState(0);

  const lessonKeys = [
    'overview',
    'cardAnatomy',
    'turnStructure',
    'playingCards',
    'missions',
    'upgrade',
    'special',
    'gameplay',
  ] as const;

  const goNext = useCallback(() => {
    if (currentLesson < TOTAL_LESSONS - 1) {
      setDirection(1);
      setCurrentLesson((prev) => prev + 1);
    }
  }, [currentLesson]);

  const goPrev = useCallback(() => {
    if (currentLesson > 0) {
      setDirection(-1);
      setCurrentLesson((prev) => prev - 1);
    }
  }, [currentLesson]);

  const progressPercent = ((currentLesson + 1) / TOTAL_LESSONS) * 100;

  // Render current lesson scene
  function renderLessonScene(index: number) {
    switch (index) {
      case 0:
        return <LessonOverview t={t} />;
      case 1:
        return <LessonCardAnatomy t={t} />;
      case 2:
        return <LessonTurnStructure t={t} />;
      case 3:
        return <LessonPlayingCards t={t} />;
      case 4:
        return <LessonMissions t={t} />;
      case 5:
        return <LessonUpgrade t={t} />;
      case 6:
        return <LessonSpecialMechanics t={t} />;
      case 7:
        return <LessonGameplay t={t} />;
      default:
        return null;
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '860px',
        margin: '0 auto',
        backgroundColor: '#0a0a0a',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(196, 163, 90, 0.15)',
      }}
    >
      {/* Progress bar at top */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '3px',
          backgroundColor: '#1a1a1a',
        }}
      >
        <motion.div
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            height: '100%',
            backgroundColor: '#c4a35a',
          }}
        />
      </div>

      {/* Lesson title header */}
      <div
        style={{
          padding: '16px 20px 8px',
          borderBottom: '1px solid rgba(196, 163, 90, 0.1)',
        }}
      >
        <motion.h3
          key={currentLesson}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            color: '#c4a35a',
            fontSize: '1.2rem',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '0.03em',
          }}
        >
          {t(`tutorial.lessons.${lessonKeys[currentLesson]}.title`)}
        </motion.h3>
        <motion.p
          key={`desc-${currentLesson}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          style={{
            color: '#888888',
            fontSize: '0.92rem',
            margin: '4px 0 0',
            lineHeight: 1.4,
          }}
        >
          {t(`tutorial.lessons.${lessonKeys[currentLesson]}.desc`)}
        </motion.p>
      </div>

      {/* Lesson scene area with AnimatePresence */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: 'calc(100vh - 280px)',
        }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentLesson}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            style={{
              position: 'relative',
              width: '100%',
            }}
          >
            {renderLessonScene(currentLesson)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px 16px',
          borderTop: '1px solid rgba(196, 163, 90, 0.1)',
        }}
      >
        {/* Prev button */}
        <button
          onClick={goPrev}
          disabled={currentLesson === 0}
          style={{
            padding: '8px 20px',
            backgroundColor: currentLesson === 0 ? '#1a1a1a' : 'transparent',
            border: currentLesson === 0
              ? '1px solid #2a2a2a'
              : '1px solid rgba(196, 163, 90, 0.4)',
            borderRadius: '6px',
            color: currentLesson === 0 ? '#444444' : '#c4a35a',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: currentLesson === 0 ? 'default' : 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={(e) => {
            if (currentLesson > 0) {
              (e.target as HTMLElement).style.borderColor = '#c4a35a';
            }
          }}
          onMouseLeave={(e) => {
            if (currentLesson > 0) {
              (e.target as HTMLElement).style.borderColor = 'rgba(196, 163, 90, 0.4)';
            }
          }}
        >
          {t('tutorial.prev')}
        </button>

        {/* Lesson counter */}
        <span
          style={{
            color: '#666666',
            fontSize: '0.92rem',
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}
        >
          {t('tutorial.lesson', { current: String(currentLesson + 1), total: String(TOTAL_LESSONS) })}
        </span>

        {/* Next button */}
        <button
          onClick={goNext}
          disabled={currentLesson === TOTAL_LESSONS - 1}
          style={{
            padding: '8px 20px',
            backgroundColor:
              currentLesson === TOTAL_LESSONS - 1 ? '#1a1a1a' : 'transparent',
            border:
              currentLesson === TOTAL_LESSONS - 1
                ? '1px solid #2a2a2a'
                : '1px solid rgba(196, 163, 90, 0.4)',
            borderRadius: '6px',
            color: currentLesson === TOTAL_LESSONS - 1 ? '#444444' : '#c4a35a',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: currentLesson === TOTAL_LESSONS - 1 ? 'default' : 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={(e) => {
            if (currentLesson < TOTAL_LESSONS - 1) {
              (e.target as HTMLElement).style.borderColor = '#c4a35a';
            }
          }}
          onMouseLeave={(e) => {
            if (currentLesson < TOTAL_LESSONS - 1) {
              (e.target as HTMLElement).style.borderColor = 'rgba(196, 163, 90, 0.4)';
            }
          }}
        >
          {t('tutorial.next')}
        </button>
      </div>
    </div>
  );
}
