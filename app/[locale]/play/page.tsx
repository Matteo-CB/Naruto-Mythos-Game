"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { motion } from "framer-motion";
import { CloudBackground } from "@/components/CloudBackground";
import { PowerIcon } from "@/components/icons/GameIcons";
import { DecorativeIcons } from "@/components/DecorativeIcons";
import { Footer } from "@/components/Footer";
import { useSettingsStore } from "@/stores/settingsStore";

type ModeEntry = {
  key: string;
  href: "/play/online" | "/play/ai" | "/play/hotseat";
  titleKey: "onlineTitle" | "aiTitle" | "hotseatTitle";
  descKey: "onlineDesc" | "aiDesc" | "hotseatDesc";
  glyph: string;
};

const ACCENT = "var(--t-on-accent-surface)";
const ACCENT_BRIGHT = "var(--t-on-accent-surface-strong)";

export default function PlayHubPage() {
  const t = useTranslations("playHub");
  const { animationsEnabled } = useSettingsStore();

  const modes: ModeEntry[] = [
    { key: "online", href: "/play/online", titleKey: "onlineTitle", descKey: "onlineDesc", glyph: "VS" },
    { key: "ai", href: "/play/ai", titleKey: "aiTitle", descKey: "aiDesc", glyph: "IA" },
    { key: "hotseat", href: "/play/hotseat", titleKey: "hotseatTitle", descKey: "hotseatDesc", glyph: "SELF" },
  ];

  return (
    <div
      id="main-content"
      className="min-h-screen relative flex flex-col"
      style={{ backgroundColor: "var(--t-bg)" }}
    >
      <CloudBackground animated={animationsEnabled} />
      <DecorativeIcons animated={animationsEnabled} />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto relative z-10 flex-1 w-full px-4 py-12 flex flex-col items-center"
      >
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-display text-2xl sm:text-3xl font-bold uppercase text-center mb-2"
          style={{
            color: "var(--t-accent)",
            letterSpacing: "0.2em",
          }}
        >
          {t("title")}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="font-body text-[10px] uppercase text-center mb-10"
          style={{ color: "var(--t-muted)", letterSpacing: "0.36em" }}
        >
          {t("subtitle")}
        </motion.p>

        <div className="flex flex-col gap-3 w-full">
          {modes.map((mode, i) => (
            <motion.div
              key={mode.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 + i * 0.08 }}
            >
              <Link
                href={mode.href}
                className="group relative flex flex-col items-center justify-center p-5 overflow-hidden"
                style={{
                  backgroundColor: "var(--t-accent-surface)",
                  border: "1px solid var(--t-accent-surface-border)",
                  transition: "border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease",
                }}
                onMouseEnter={(e: React.MouseEvent) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "var(--t-accent-surface-border-strong)";
                  el.style.backgroundColor = "var(--t-accent-surface-hover)";
                  el.style.boxShadow =
                    "0 8px 22px var(--t-shadow), 0 0 22px var(--t-accent-glow)";
                  const sep = el.querySelector<HTMLElement>("[data-sep]");
                  if (sep) {
                    sep.style.opacity = "1";
                    const glyph = sep.firstElementChild as HTMLElement | null;
                    if (glyph) {
                      glyph.style.transform = "rotate(180deg) scale(1.25)";
                      glyph.style.backgroundColor = ACCENT_BRIGHT;
                    }
                  }
                  const title = el.querySelector<HTMLElement>("[data-title]");
                  if (title) title.style.color = ACCENT_BRIGHT;
                  const desc = el.querySelector<HTMLElement>("[data-desc]");
                  if (desc) desc.style.color = "var(--t-muted)";
                  const num = el.querySelector<HTMLElement>("[data-num]");
                  if (num) num.style.opacity = "0.11";
                }}
                onMouseLeave={(e: React.MouseEvent) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "var(--t-accent-surface-border)";
                  el.style.backgroundColor = "var(--t-accent-surface)";
                  el.style.boxShadow = "none";
                  const sep = el.querySelector<HTMLElement>("[data-sep]");
                  if (sep) {
                    sep.style.opacity = "0.75";
                    const glyph = sep.firstElementChild as HTMLElement | null;
                    if (glyph) {
                      glyph.style.transform = "rotate(0deg) scale(1)";
                      glyph.style.backgroundColor = ACCENT;
                    }
                  }
                  const title = el.querySelector<HTMLElement>("[data-title]");
                  if (title) title.style.color = ACCENT;
                  const desc = el.querySelector<HTMLElement>("[data-desc]");
                  if (desc) desc.style.color = "var(--t-muted)";
                  const num = el.querySelector<HTMLElement>("[data-num]");
                  if (num) num.style.opacity = "0.06";
                }}
              >
                <span
                  aria-hidden
                  data-num
                  className="font-display font-bold pointer-events-none select-none absolute"
                  style={{
                    right: 14,
                    top: 2,
                    fontSize: mode.glyph.length > 2 ? 48 : 60,
                    lineHeight: 1,
                    color: ACCENT,
                    opacity: 0.06,
                    letterSpacing: "0.02em",
                    transition: "opacity 240ms ease",
                  }}
                >
                  {mode.glyph}
                </span>

                <span
                  data-title
                  className="font-display text-base font-bold uppercase relative z-10"
                  style={{
                    color: ACCENT,
                    letterSpacing: "0.16em",
                    transition: "color 220ms ease",
                  }}
                >
                  {t(mode.titleKey)}
                </span>

                <motion.span
                  data-sep
                  aria-hidden
                  className="block mt-2 mb-2 relative z-10"
                  style={{ lineHeight: 0, opacity: 0.75 }}
                  animate={animationsEnabled ? { scale: [1, 1.06, 1] } : undefined}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <PowerIcon
                    size={20}
                    color={ACCENT}
                    style={{
                      display: "block",
                      transition:
                        "transform 420ms cubic-bezier(0.34, 1.4, 0.5, 1), background-color 220ms ease" }}
                  />
                </motion.span>

                <span
                  data-desc
                  className="font-body text-xs text-center max-w-[260px] relative z-10"
                  style={{
                    color: "var(--t-on-accent-surface-text)",
                    lineHeight: 1.5,
                    transition: "color 220ms ease",
                  }}
                >
                  {t(mode.descKey)}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="mt-8 text-center"
        >
          <Link
            href={"/" as "/"}
            className="font-body text-[11px] uppercase transition-opacity hover:opacity-100"
            style={{ color: "var(--t-muted)", letterSpacing: "0.3em", opacity: 0.7 }}
          >
            {"<"} {t("backToMenu")}
          </Link>
        </motion.div>
      </motion.div>
      <Footer />
    </div>
  );
}
