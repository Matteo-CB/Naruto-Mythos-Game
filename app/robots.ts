import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const SITE_URL = "https://narutomythosgame.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/game/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
