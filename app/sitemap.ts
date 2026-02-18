import type { MetadataRoute } from "next";

const SITE_URL = "https://narutomythosgame.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ["en", "fr"];
  const now = new Date();

  const staticPages = [
    { path: "", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/play/ai", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/play/online", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/collection", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/deck-builder", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/leaderboard", priority: 0.7, changeFrequency: "daily" as const },
    { path: "/learn", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/quiz", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/bug-report", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/login", priority: 0.4, changeFrequency: "yearly" as const },
    { path: "/register", priority: 0.4, changeFrequency: "yearly" as const },
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
          languages: Object.fromEntries(
            locales.map((l) => [l, `${SITE_URL}/${l}${page.path}`])
          ),
        },
        images: page.path === ""
          ? [`${SITE_URL}/images/og-image.webp`]
          : undefined,
      });
    }
  }

  return entries;
}
