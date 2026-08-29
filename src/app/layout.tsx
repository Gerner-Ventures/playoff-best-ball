import type { Metadata } from "next";
import { Caveat, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { ChalkFilter } from "@/components/chalk-filter";

// Chalk headings and flourishes. Caveat is variable (400–700).
const caveat = Caveat({
  variable: "--font-chalk",
  subsets: ["latin"],
});

// Body copy.
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

// Every figure: scores, pick codes, clocks. Tabular by construction, so
// columns line up — the reason data does not live in the chalk face.
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Playoff Best Ball",
  description: "Run an NFL playoff best ball league with your friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${caveat.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ChalkFilter />
        <PwaRegister />
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
