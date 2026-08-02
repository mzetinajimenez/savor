import type { Metadata, Viewport } from "next";
import { Archivo, Bodoni_Moda, Hanken_Grotesk } from "next/font/google";
import { Suspense } from "react";
import AppInit from "./components/AppInit";
import BottomNav from "./components/BottomNav";
import { AddPlaceHost } from "./components/places/PlaceForm";
import { Toaster } from "./components/Toast";
import "./globals.css";

// Type pairing for savor's "Supper Club" look: Bodoni Moda (a high-contrast didone) for
// display and place names, Hanken Grotesk for body, Archivo for uppercase utility labels.
// Weights are subset to exactly what the type scale uses.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo",
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
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "savor",
  },
};

export const viewport: Viewport = {
  // Supper Club bottle-green ground (--color-ground) so the browser chrome blends into the app.
  themeColor: "#0f3b2e",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom deliberately left enabled (no maximumScale / userScalable) — WCAG 1.4.4.
  // Required for env(safe-area-inset-*) to be non-zero on notched phones.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bodoni.variable} ${hanken.variable} ${archivo.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* Single-mount data touchpoint: seeds the DB + requests persistent storage. */}
        <AppInit />
        {/* Content clears the fixed bottom nav (nav + FAB overhang + safe area). */}
        {/* Clears the fixed nav AND the FAB, which overhangs ~1.75rem above the bar —
            6rem cleared the bar alone and let the FAB sit on top of trailing content. */}
        <main className="mx-auto w-full max-w-xl pb-[calc(8rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <BottomNav />
        <Toaster />
        {/* T8's add-place sheet: listens for the FAB's savor:add-place event, renders on demand. */}
        {/* Its own boundary: AddPlaceHost calls useSearchParams(), and an unbounded call in
            the root layout would push every page's static shell to client rendering. Scoped
            here, only this (null-rendering) host defers. */}
        <Suspense fallback={null}>
          <AddPlaceHost />
        </Suspense>
      </body>
    </html>
  );
}
