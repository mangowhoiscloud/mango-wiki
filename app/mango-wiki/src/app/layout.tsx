import type { Metadata } from "next";
import { Source_Serif_4, Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import "./wiki.css";
import { Sidebar, SidebarBody } from "@/components/Sidebar";
import { ReadingProgress } from "@/components/ReadingProgress";
import { HoverTransclude } from "@/components/HoverTransclude";
import { ThemeScript } from "@/components/ThemeScript";
import { MobileNav } from "@/components/MobileNav";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  style: ["normal", "italic"],
});
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "mango-wiki",
  description:
    "Personal LLM-compiled wiki aggregating GEODE / Kiki / Kiki AppMaker knowledge. Same engine as kiki-wiki + kiki-appmaker-wiki, branded for the mango-wiki Obsidian vault. Each page cites where it was compiled from.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const fontVars = `${sourceSerif.variable} ${newsreader.variable} ${inter.variable} ${jetbrains.variable}`;
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ReadingProgress />
        <MobileNav>
          <SidebarBody />
        </MobileNav>
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">{children}</main>
        </div>
        <HoverTransclude />
      </body>
    </html>
  );
}
