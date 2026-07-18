import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import AppInit from "./components/AppInit";
import BottomNav from "./components/BottomNav";
import { Toaster } from "./components/Toast";
import "./globals.css";

// Type pairing for savor's "Cellar" look: Instrument Serif for menu-style display, Hanken
// Grotesk for warm, legible body/UI. Both wired as CSS variables consumed by @theme.
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "savor",
  description:
    "Track restaurants and food experiences: places you've been, a want-to-try list, and rankings you define.",
  manifest: "/manifest.webmanifest",
  icons: {
    // PNGs first — iOS ignores SVG icons entirely.
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "savor",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Required for env(safe-area-inset-*) to be non-zero on notched phones.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrument.variable} ${hanken.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* Single-mount data touchpoint: seeds the DB + requests persistent storage. */}
        <AppInit />
        {/* Content clears the fixed bottom nav (nav + FAB overhang + safe area). */}
        <main className="mx-auto w-full max-w-xl pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <BottomNav />
        <Toaster />
      </body>
    </html>
  );
}
