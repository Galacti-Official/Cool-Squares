import type { Metadata } from "next";
import "./globals.css";
import { PT_Sans } from 'next/font/google';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400','700'],
});

export const metadata: Metadata = {
	title: "CoolSquares",
	description: "Aplikace pro plánování ochlazení města a analýzu okolí v České republice."
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={`${ptSans.className} scroll-smooth`}>
      <body className="flex flex-col font-sans">
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
