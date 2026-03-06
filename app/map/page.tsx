import MapView from "@/components/map/MapView";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { Metadata } from "next";

export default function MapPage() {
  return (
    <>
      <Navbar />
      <main>
        <MapView />
      </main>
      <Footer />
    </>
  );
}
