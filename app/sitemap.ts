import type { MetadataRoute } from "next";
import { routing } from "@/lib/i18n/routing";
import { ORDERED_CARD_IDS } from "@/lib/cards/order";
import { cardIdToSlug } from "@/lib/cards/slug";
import { getCardById } from "@/lib/data/cardIndex";
import { normalizeImagePath } from "@/lib/utils/imagePath";

const SITE_URL = "https://narutomythosgame.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = [...routing.locales];
  const now = new Date();

  const staticPages = [
    { path: "", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/play", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/play/ai", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/play/online", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/play/sealed", priority: 0.85, changeFrequency: "monthly" as const },
    { path: "/play/hotseat", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/play/training", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/play/online/evolving", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/collection", priority: 0.85, changeFrequency: "monthly" as const },
    { path: "/deck-builder", priority: 0.85, changeFrequency: "monthly" as const },
    { path: "/leaderboard", priority: 0.8, changeFrequency: "daily" as const },
    { path: "/tournaments", priority: 0.75, changeFrequency: "daily" as const },
    { path: "/tournaments/results", priority: 0.6, changeFrequency: "weekly" as const },
    { path: "/topdeck", priority: 0.7, changeFrequency: "daily" as const },
    { path: "/topdeck/players", priority: 0.6, changeFrequency: "daily" as const },
    { path: "/help-us", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/register", priority: 0.5, changeFrequency: "yearly" as const },
    { path: "/login", priority: 0.4, changeFrequency: "yearly" as const },
    { path: "/legal", priority: 0.2, changeFrequency: "yearly" as const },
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const page of staticPages) {
    for (const locale of locales) {
      entries.push({
        url: `${SITE_URL}/${locale}${page.path}`,
        lastModified: now,
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: {
          languages: {
            ...Object.fromEntries(
              locales.map((l) => [l, `${SITE_URL}/${l}${page.path}`])
            ),
            "x-default": `${SITE_URL}/en${page.path}`,
          },
        },
        images: page.path === ""
          ? [`${SITE_URL}/images/og-image.webp`]
          : undefined,
      });
    }
  }

  for (const id of ORDERED_CARD_IDS) {
    const slug = cardIdToSlug(id);
    const path = `/cards/${slug}`;
    const card = getCardById(id);
    const img = card ? normalizeImagePath(card.image_file) : null;
    for (const locale of locales) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.6,
        alternates: {
          languages: {
            ...Object.fromEntries(
              locales.map((l) => [l, `${SITE_URL}/${l}${path}`])
            ),
            "x-default": `${SITE_URL}/en${path}`,
          },
        },
        images: img ? [`${SITE_URL}${img.split("?")[0]}`] : undefined,
      });
    }
  }

  return entries;
}
