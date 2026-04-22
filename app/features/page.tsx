import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EncyclopediaView from "@/components/encyclopedia/EncyclopediaView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Encyklopedie — CoolSquares",
  description: "Referenční knihovna všech prvků pro ochlazení města — květináče, nádoby, půdní pokryvy, vodní prvky a další.",
};

export default function EncyclopediaPage() {
  return (
    <>
      <Navbar />
      <main>
        <Suspense>
          <EncyclopediaView />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
