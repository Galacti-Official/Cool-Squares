// Esri's light gray canvas tiles are free and keyless, unlike CARTO's basemaps
// (basemaps.cartocdn.com now requires an account and watermarks unauthenticated tiles)
export const LIGHT_BASE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
export const LIGHT_LABELS_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
export const LIGHT_TILES_ATTRIBUTION = "© Esri";

/**
 * Loads Leaflet from the CDN exactly once and resolves with the global `L`
 * Shared by every map component so the script/stylesheet are never injected twice
 */
let leafletLoader: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet can only be loaded in the browser"));
  }
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletLoader) return leafletLoader;

  leafletLoader = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet="1"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }

    const existing = document.querySelector('script[data-leaflet="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", () => reject(new Error("Failed to load Leaflet script")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.setAttribute("data-leaflet", "1");
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error("Failed to load Leaflet script"));
    document.head.appendChild(script);
  });

  return leafletLoader;
}
