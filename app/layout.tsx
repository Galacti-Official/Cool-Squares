import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoolSquares — Urban Cooling Initiative",
  description:
    "Evidence-based interventions that reduce city square surface temperatures by up to 8°C.",
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
