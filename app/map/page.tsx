import MapView from "@/components/map/MapView";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Heat Map — CoolSquares",
  description: "Explore before & after thermal impact of CoolSquares interventions on city squares.",
};

export default function MapPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-bg">
        <MapView />
      </main>
      <Footer />
    </>
  );
}
