import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const gameImagePreloads = [
  "/crack-attack-assets/logo.png",
  "/crack-attack-assets/font0_score.png",
  "/crack-attack-assets/message_anykey.png",
  "/crack-attack-assets/message_tap_screen.png",
  "/crack-attack-assets/message_paused.png",
  "/crack-attack-assets/message_game_over.png",
  "/crack-attack-assets/count_down_1.png",
  "/crack-attack-assets/count_down_2.png",
  "/crack-attack-assets/count_down_3.png",
  "/crack-attack-assets/count_down_go.png",
  ...Array.from(
    { length: 6 },
    (_, index) => `/crack-attack-assets/garbage_flavor_${index.toString().padStart(3, "0")}.png`,
  ),
  ...Array.from(
    { length: 9 },
    (_, index) => `/crack-attack-assets/sign_${index + 4}.png`,
  ),
  ...Array.from(
    { length: 11 },
    (_, index) => `/crack-attack-assets/sign_x${index + 2}.png`,
  ),
];

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crack Attack! — Browser Port",
  description: "A playable single-player browser port of the open-source puzzle game Crack Attack!",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/crack-attack-assets/logo.png",
    shortcut: "/crack-attack-assets/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {gameImagePreloads.map((href) => (
          <link key={href} rel="preload" as="image" href={href} />
        ))}
        <link
          rel="preload"
          as="fetch"
          href="/crack-attack-assets/block.obj"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
