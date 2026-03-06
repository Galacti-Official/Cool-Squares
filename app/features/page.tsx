import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EncyclopediaView from "@/components/encyclopedia/EncyclopediaView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Encyclopedia — CoolSquares",
  description: "Reference library of all urban cooling objects — planters, pots, ground cover, water features and more.",
};

export default function EncyclopediaPage() {
  return (
    <>
      <Navbar />
      <main>
        <EncyclopediaView />
      </main>
      <Footer />
    </>
  );
}