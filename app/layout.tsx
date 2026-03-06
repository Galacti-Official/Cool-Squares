import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoolSquares — Ochlaďte své město",
  description:
    "Tady bude popis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
