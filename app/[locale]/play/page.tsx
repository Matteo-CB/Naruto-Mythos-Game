"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { motion } from "framer-motion";
import { CloudBackground } from "@/components/CloudBackground";
import { DecorativeIcons } from "@/components/DecorativeIcons";
import { Footer } from "@/components/Footer";
import { useSettingsStore } from "@/stores/settingsStore";

export default function PlayHubPage() {
  const t = useTranslations("playHub");
  const { animationsEnabled } = useSettingsStore();

  const modes = [
    { key: "online", href: "/play/online" as const, titleKey: "onlineTitle" as const, descKey: "onlineDesc" as const },
    { key: "ai", href: "/play/ai" as const, titleKey: "aiTitle" as const, descKey: "aiDesc" as const },
  ];

  return (
    <div id="main-content" className="min-h-screen relative flex flex-col" style={{ backgroundColor: "#0a0a0a" }}>
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
          className="text-2xl font-bold uppercase tracking-wider text-center mb-2"
          style={{ color: "#c4a35a" }}
        >
          {t("title")}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="text-xs uppercase tracking-widest text-center mb-8"
          style={{ color: "#888888" }}
        >
          {t("subtitle")}
        </motion.p>

        <div className="flex flex-col gap-3 w-full">
          {modes.map((mode, i) => (
            <motion.div
              key={mode.key}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + i * 0.1 }}
            >
              <Link
                href={mode.href}
                className="group relative flex flex-col items-center justify-center p-5 transition-all"
                style={{
                  backgroundColor: "#111111",
                  border: "1px solid #262626",
                }}
                onMouseEnter={(e: React.MouseEvent) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "#c4a35a";
                  el.style.boxShadow = "0 0 20px rgba(196, 163, 90, 0.12)";
                  el.style.transform = "scale(1.02)";
                }}
                onMouseLeave={(e: React.MouseEvent) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "#262626";
                  el.style.boxShadow = "none";
                  el.style.transform = "scale(1)";
                }}
              >
                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "#c4a35a" }}>
                  {t(mode.titleKey)}
                </span>
                <span className="text-xs mt-1" style={{ color: "#888888" }}>
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
          <Link href={"/" as "/"} className="text-sm transition-colors" style={{ color: "#888888" }}>
            {"<"} {t("backToMenu")}
          </Link>
        </motion.div>
      </motion.div>
      <Footer />
    </div>
  );
}
