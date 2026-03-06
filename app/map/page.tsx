import MapView from "@/components/map/MapView";
import Navbar2 from "@/components/Navbar2";
import Footer from "@/components/Footer";

export default function MapPage() {
  return (
    <>
      <Navbar2 />
      <main>
        <MapView />
      </main>
      <Footer />
    </>
  );
}
