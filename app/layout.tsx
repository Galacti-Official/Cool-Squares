import type { Metadata } from "next";
import "./globals.css";
import { PT_Sans } from 'next/font/google';

// load PT Sans; the CSS variable becomes --font-pt-sans
const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400','700'],
});

export const metadata: Metadata = {
	title: "CoolSquares",
	description: ""
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${ptSans.className} scroll-smooth`}>
      <body className="flex flex-col font-sans">
        {/* Page content */}
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
