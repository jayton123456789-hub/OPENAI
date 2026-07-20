import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MaskLife Games — Veilbound & Realm Roll",
  description:
    "Play Veilbound and Realm Roll: polished mobile games for solo, local, and private two-device play.",
  applicationName: "MaskLife Games",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MaskLife Games",
  },
  other: {
    "codex-preview": "development",
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0d160f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
