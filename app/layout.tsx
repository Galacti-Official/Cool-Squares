import type { Metadata } from "next";
import "./globals.css";
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en" className={`${inter.className} scroll-smooth`}>
      <body className="flex flex-col">
        {/* Page content */}
        <main className="max-w-7xl min-h-screen flex-1 px-6 py-12 mx-auto w-full items-center justify-center">
          {children}
        </main>
      </body>
    </html>
  );
}
