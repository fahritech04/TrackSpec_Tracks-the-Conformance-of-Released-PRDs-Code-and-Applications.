import type { Metadata } from "next";
import { Bungee, JetBrains_Mono, Nunito } from "next/font/google";
import "./globals.css";

const sans = Nunito({
  variable: "--font-ibm-plex-sans",
  weight: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const display = Bungee({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrackSpec",
  description:
    "TrackSpec tracks PRD-Code-App conformance for released applications.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
