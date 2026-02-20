import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

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

const inter = Inter({
  variable: "--font-inter",
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Naruto Mythos TCG - Jeu de Cartes en Ligne",
    template: "%s | Naruto Mythos TCG",
  },
  description:
    "Jouez gratuitement au Naruto Mythos Trading Card Game en ligne. Affrontez une IA intelligente sur 4 niveaux de difficulte ou defiez d'autres joueurs en multijoueur temps reel. Construisez votre deck strategique parmi 186 cartes uniques inspirees de Naruto Shippuden, collectionnez des cartes rares et grimpez le classement ELO competitif. Jeu de cartes a collectionner gratuit avec deck builder, quiz Naruto et systeme de matchmaking.",
  keywords: [
    "Naruto",
    "TCG",
    "Trading Card Game",
    "jeu de cartes",
    "Naruto Mythos",
    "Naruto Mythos TCG",
    "carte Naruto",
    "jeu en ligne",
    "jeu en ligne gratuit",
    "deck builder",
    "constructeur de deck",
    "ELO",
    "classement ELO",
    "multijoueur",
    "anime card game",
    "jeu de cartes a collectionner",
    "Naruto card game online",
    "Naruto card game free",
    "play Naruto card game",
    "Naruto Shippuden",
    "Naruto Shippuden card game",
    "jeu de cartes strategique",
    "jeu de cartes Naruto en ligne",
    "Naruto TCG online free",
    "Naruto trading card game online",
    "free anime card game",
    "jeu de cartes anime gratuit",
    "ninja card game",
    "jeu Naruto gratuit",
    "Sasuke",
    "Kakashi",
    "Sakura",
    "Itachi",
    "Gaara",
    "collectible card game",
    "CCG",
    "carte a collectionner",
    "jouer Naruto en ligne",
    "jeu de cartes multijoueur",
    "competitive card game",
    "ranked card game",
    "construire deck Naruto",
    "jeu de cartes en ligne gratuit",
    "card game browser",
    "jeu de cartes navigateur",
    "Naruto fan game",
    "jeu Naruto fan",
  ],
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
    locale: "fr_FR",
    alternateLocale: "en_US",
    url: SITE_URL,
    siteName: "Naruto Mythos TCG",
    title: "Naruto Mythos TCG - Jeu de Cartes Naruto Gratuit en Ligne",
    description:
      "Jeu de cartes Naruto Shippuden gratuit en ligne. 186 cartes uniques, IA intelligente, multijoueur temps reel, deck builder, classement ELO et quiz. Jouez maintenant sans telechargement.",
    images: [
      {
        url: "/images/og-image.webp",
        width: 1200,
        height: 630,
        alt: "Naruto Mythos TCG - Trading Card Game",
        type: "image/webp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Naruto Mythos TCG - Jeu de Cartes Naruto Gratuit",
    description:
      "Jeu de cartes Naruto Shippuden gratuit. 186 cartes, IA sur 4 niveaux, multijoueur temps reel, deck builder et classement ELO. Jouez maintenant dans votre navigateur.",
    images: ["/images/og-image.webp"],
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
    languages: {
      en: `${SITE_URL}/en`,
      fr: `${SITE_URL}/fr`,
    },
  },
  category: "games",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/njnaruto.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        <link rel="prefetch" href="/images/rare/108-130_NARUTO_UZUMAKI.webp" />
        <link rel="preload" href="/images/icons/cloud-2.webp" as="image" type="image/webp" />
        <link rel="preload" href="/images/icons/cloud-5.webp" as="image" type="image/webp" />
        <link rel="preload" href="/images/icons/cloud-6.webp" as="image" type="image/webp" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased bg-[#0a0a0a] text-[#e0e0e0] min-h-screen`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-9999 focus:px-4 focus:py-2 focus:text-sm focus:font-bold"
          style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
        >
          Skip to content
        </a>
        <noscript>
          <div style={{ padding: '16px', textAlign: 'center', backgroundColor: '#1a1a0a', color: '#c4a35a', borderBottom: '1px solid #c4a35a' }}>
            JavaScript is required to play Naruto Mythos TCG.
          </div>
        </noscript>
        {children}
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
