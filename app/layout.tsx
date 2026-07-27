import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import { createTranslator } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";
import { getSiteFacts } from '@/lib/seo/siteFacts';

type RootMessages = Record<string, unknown> & { _meta?: { ogLocale?: string }; rootMeta?: { keywords?: string[] } };
type StringTranslator = (key: string, values?: Record<string, string | number>) => string;

async function loadRootMessages(locale: string): Promise<RootMessages> {
  return (await import(`@/messages/${locale}.json`)).default as RootMessages;
}

function pickRootLocale(cookieLocale: string | undefined): string {
  return (routing.locales as readonly string[]).includes(cookieLocale ?? "") ? (cookieLocale as string) : routing.defaultLocale;
}

function rootTranslator(locale: string, messages: RootMessages, namespace: string): StringTranslator {
  return createTranslator({ locale, messages, namespace }) as unknown as StringTranslator;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://narutomythosgame.com";

export const viewport: Viewport = {
  themeColor: "#c4a35a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = pickRootLocale(cookieStore.get("NEXT_LOCALE")?.value);
  const messages = await loadRootMessages(locale);
  const t = rootTranslator(locale, messages, "rootMeta");
  const ogLocale = messages._meta?.ogLocale ?? "en_US";
  const { cardCount } = getSiteFacts();
  const keywords = messages.rootMeta?.keywords ?? [];

  const languages: Record<string, string> = {};
  const alternateLocale: string[] = [];
  for (const loc of routing.locales) {
    languages[loc] = `${SITE_URL}/${loc}`;
    if (loc !== locale) {
      const otherOg = (await loadRootMessages(loc))._meta?.ogLocale;
      if (otherOg) alternateLocale.push(otherOg);
    }
  }
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t("titleDefault"),
      template: t("titleTemplate"),
    },
    description: t("description"),
    keywords,
    authors: [{ name: "HiddenLab", url: "https://hiddenlab.fr" }],
    creator: "HiddenLab",
    publisher: "HiddenLab",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: ogLocale,
      alternateLocale,
      url: SITE_URL,
      siteName: "Naruto Mythos TCG",
      title: t("ogTitle"),
      description: t("ogDescription", { cardCount }),
      images: [
        {
          url: `${SITE_URL}/images/og-image.webp?v=2`,
          width: 1200,
          height: 630,
          alt: t("ogImageAlt"),
          type: "image/webp",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("twitterTitle"),
      description: t("twitterDescription", { cardCount }),
      images: [`${SITE_URL}/images/og-image.webp?v=2`],
    },
    icons: {
      icon: [
        { url: "/icons/favicon.ico", sizes: "any" },
        { url: "/icons/icon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    alternates: {
      canonical: SITE_URL,
      languages,
    },
    category: "games",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = pickRootLocale(cookieStore.get('NEXT_LOCALE')?.value);
  const messages = await loadRootMessages(locale);
  const t = rootTranslator(locale, messages, 'rootLayout');
  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/njnaruto-accented.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/geist-regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        <link rel="prefetch" href="/images/cards/KS/rare_art/KS-108-RA.webp" />
        <link rel="preload" href="/images/icons/cloud-2.webp" as="image" type="image/webp" />
        <link rel="preload" href="/images/icons/cloud-5.webp" as="image" type="image/webp" />
        <link rel="preload" href="/images/icons/cloud-6.webp" as="image" type="image/webp" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-[#e0e0e0] min-h-screen`}
      >
        {process.env.NODE_ENV !== 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(function(){try{if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){if(rs&&rs.length){Promise.all(rs.map(function(r){return r.unregister();})).then(function(){if(self.caches){caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}).then(rl);}else{rl();}});}});}function rl(){try{if(!sessionStorage.getItem('nm-sw-cleared')){sessionStorage.setItem('nm-sw-cleared','1');location.reload();}}catch(e){location.reload();}}}catch(e){}})();",
            }}
          />
        )}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-9999 focus:px-4 focus:py-2 focus:text-sm focus:font-bold"
          style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
        >
          {t('skipToContent')}
        </a>
        <noscript>
          <div style={{ padding: '16px', textAlign: 'center', backgroundColor: '#1a1a0a', color: '#c4a35a', borderBottom: '1px solid #c4a35a' }}>
            {t('noJs')}
          </div>
        </noscript>
        {children}
        <ServiceWorkerRegistrar />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-7R10MZLMBD"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-7R10MZLMBD', {
              page_path: window.location.pathname,
              anonymize_ip: true,
              cookie_flags: 'SameSite=None;Secure'
            });
          `}
        </Script>
        <noscript>
          <img
            src="https://www.googletagmanager.com/ns.html?id=G-7R10MZLMBD"
            alt=""
            width="1"
            height="1"
            style={{ display: 'none' }}
          />
        </noscript>
      </body>
    </html>
  );
}
