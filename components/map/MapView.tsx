"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode = "idle" | "drawing";
type AppPage = "map" | "results" | "editor";

interface SelectedArea {
  points: [number, number][];
  bounds: { north: number; south: number; east: number; west: number };
  areaSqKm: number;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function segmentsIntersect(
  a1: [number, number], a2: [number, number],
  b1: [number, number], b2: [number, number]
): boolean {
  const cross = (o: [number, number], p: [number, number], q: [number, number]) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(b1, b2, a1), d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1), d4 = cross(a1, a2, b2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

function wouldSelfIntersect(points: [number, number][], newPoint: [number, number]): boolean {
  const n = points.length;
  if (n < 2) return false;
  for (let i = 0; i < n - 2; i++) {
    if (segmentsIntersect(points[n - 1], newPoint, points[i], points[i + 1])) return true;
  }
  return false;
}

function closingWouldSelfIntersect(points: [number, number][]): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 1; i < n - 2; i++) {
    if (segmentsIntersect(points[n - 1], points[0], points[i], points[i + 1])) return true;
  }
  return false;
}

// Shoelace formula
function computeAreaSqKm(points: [number, number][]): number {
  const R = 6371;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = (points[i][0] * Math.PI) / 180;
    const lat2 = (points[j][0] * Math.PI) / 180;
    const dLng = ((points[j][1] - points[i][1]) * Math.PI) / 180;
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * R * R) / 2);
}

// ─── Mini map for results page ────────────────────────────────────────────────
function MiniMap({ area }: { area: SelectedArea }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current || !ref.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(ref.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 20, opacity: 0.6,
    }).addTo(map);

    const world: [number, number][] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
    L.polygon([world, area.points], {
      color: "transparent",
      fillColor: "#F4F5E0",
      fillOpacity: 0.85,
      fillRule: "evenodd",
      interactive: false,
    }).addTo(map);

    const poly = L.polygon(area.points, {
      color: "#2e3a1f", weight: 2.5, fill: false, interactive: false,
    }).addTo(map);

    map.fitBounds(poly.getBounds(), { padding: [24, 24] });
  }, []);

  return <div ref={ref} className="w-full h-full" />;
}

// ─── Results / detail page ────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "overview", label: "Přehled", icon: "◈" },
  { id: "land", label: "Využití půdy", icon: "⬡" },
  { id: "climate", label: "Klima", icon: "◌" },
  { id: "infra", label: "Infrastruktura", icon: "⊞" },
  { id: "export", label: "Export", icon: "↗" },
];

function ResultsPage({ area, onBack }: { area: SelectedArea; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  const { bounds, areaSqKm, points } = area;
  const centerLat = ((bounds.north + bounds.south) / 2).toFixed(4);
  const centerLng = ((bounds.east + bounds.west) / 2).toFixed(4);
  const widthKm = (((bounds.east - bounds.west) * Math.PI * 6371 * Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180)) / 180).toFixed(1);
  const heightKm = (((bounds.north - bounds.south) * Math.PI * 6371) / 180).toFixed(1);

  return (
    <div
      className="absolute inset-0 z-[3000] flex flex-col"
      style={{
        background: "#F4F5E0",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(18px)",
        transition: "opacity 0.38s ease, transform 0.38s ease",
        fontFamily: "'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* ── Top bar ── */}
      <header style={{
        borderBottom: "1.5px solid #2e3a1f22",
        background: "#F4F5E0",
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "0 0 0 0",
        height: 56,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "0 20px", height: "100%",
            borderRight: "1.5px solid #2e3a1f22",
            background: "none", border: "none",
            cursor: "pointer", color: "#2e3a1f", fontSize: 13,
            fontFamily: "inherit", letterSpacing: "0.04em",
          }}
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>←</span>
          <span>Zpět na mapu</span>
        </button>

        <div style={{ flex: 1, padding: "0 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.12em", color: "#2e3a1f88", textTransform: "uppercase" }}>
            Zvolená oblast
          </span>
          <span style={{ color: "#2e3a1f44", fontSize: 11 }}>·</span>
          <span style={{ fontSize: 13, color: "#2e3a1f", fontStyle: "italic" }}>
            {areaSqKm < 1 ? `${(areaSqKm * 100).toFixed(1)} ha` : `${areaSqKm.toFixed(1)} km²`}
          </span>
          <span style={{ color: "#2e3a1f44", fontSize: 11 }}>·</span>
          <span style={{ fontSize: 13, color: "#2e3a1f99" }}>
            {points.length} vrcholů
          </span>
        </div>

        {/* Right actions — placeholders */}
        <div style={{ display: "flex", alignItems: "center", height: "100%", borderLeft: "1.5px solid #2e3a1f22" }}>
          {["Sdílet", "Uložit"].map((label) => (
            <button
              key={label}
              style={{
                padding: "0 20px", height: "100%", background: "none", border: "none",
                borderRight: "1.5px solid #2e3a1f22", cursor: "pointer",
                color: "#2e3a1f99", fontSize: 13, fontFamily: "inherit",
                letterSpacing: "0.04em",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main layout: sidebar + content ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left nav */}
        <nav style={{
          width: 180, flexShrink: 0, borderRight: "1.5px solid #2e3a1f22",
          display: "flex", flexDirection: "column", padding: "24px 0",
        }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 24px", background: "none", border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                fontSize: 13, letterSpacing: "0.04em",
                color: activeTab === item.id ? "#2e3a1f" : "#2e3a1f66",
                borderLeft: activeTab === item.id ? "2.5px solid #2e3a1f" : "2.5px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontSize: 15, opacity: activeTab === item.id ? 1 : 0.5 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <main style={{ flex: 1, overflow: "auto", padding: "32px 40px" }}>

          {activeTab === "overview" && (
            <div style={{ maxWidth: 820 }}>
              <h1 style={{
                fontSize: 28, fontWeight: 400, color: "#2e3a1f",
                marginBottom: 6, lineHeight: 1.2,
                fontStyle: "italic",
              }}>
                Vlastní oblast
              </h1>
              <p style={{ fontSize: 13, color: "#2e3a1f77", marginBottom: 36, letterSpacing: "0.04em" }}>
                Nakresleno v České republice · {new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
              </p>

              {/* Map preview + stats row */}
              <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
                {/* Mini map */}
                <div style={{
                  width: 320, height: 220, flexShrink: 0,
                  border: "1.5px solid #2e3a1f22", borderRadius: 4, overflow: "hidden",
                }}>
                  <MiniMap area={area} />
                </div>

                {/* Stats grid */}
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#2e3a1f18", border: "1.5px solid #2e3a1f22", borderRadius: 4, overflow: "hidden" }}>
                  {[
                    { label: "Celková plocha", value: areaSqKm < 1 ? `${(areaSqKm * 100).toFixed(1)} ha` : `${areaSqKm.toFixed(1)} km²` },
                    { label: "Počet vrcholů", value: points.length },
                    { label: "Šířka", value: `~${widthKm} km` },
                    { label: "Výška", value: `~${heightKm} km` },
                    { label: "Střední šířka", value: `${centerLat}° N` },
                    { label: "Střední délka", value: `${centerLng}° E` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "#F4F5E0", padding: "16px 20px" }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 20, color: "#2e3a1f", fontStyle: "italic" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Placeholder sections */}
              {["Souhrn pokrytí půdy", "Profil nadmořské výšky", "Správní jednotky"].map((title, idx) => (
                <div key={title} style={{
                  border: "1.5px solid #2e3a1f22", borderRadius: 4,
                  marginBottom: 16, overflow: "hidden",
                }}>
                  <div style={{
                    padding: "14px 20px", borderBottom: "1.5px solid #2e3a1f22",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span style={{ fontSize: 13, color: "#2e3a1f", letterSpacing: "0.04em" }}>{title}</span>
                    <span style={{ fontSize: 11, color: "#2e3a1f44", letterSpacing: "0.08em" }}>BRZY</span>
                  </div>
                  <div style={{
                    height: 80, background: "repeating-linear-gradient(90deg, #2e3a1f08 0px, #2e3a1f08 1px, transparent 1px, transparent 32px), repeating-linear-gradient(0deg, #2e3a1f08 0px, #2e3a1f08 1px, transparent 1px, transparent 32px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "#2e3a1f33", fontStyle: "italic" }}>Data se zde objeví</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab !== "overview" && (
            <div style={{ maxWidth: 820 }}>
              <h1 style={{
                fontSize: 28, fontWeight: 400, color: "#2e3a1f",
                marginBottom: 6, lineHeight: 1.2, fontStyle: "italic",
              }}>
                {NAV_ITEMS.find(n => n.id === activeTab)?.label}
              </h1>
              <p style={{ fontSize: 13, color: "#2e3a1f77", marginBottom: 36, letterSpacing: "0.04em" }}>
                Tato sekce je ve výstavbě.
              </p>
              <div style={{
                border: "1.5px dashed #2e3a1f33", borderRadius: 4,
                padding: "60px 40px", textAlign: "center",
              }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>
                  {NAV_ITEMS.find(n => n.id === activeTab)?.icon}
                </div>
                <p style={{ fontSize: 14, color: "#2e3a1f55", fontStyle: "italic" }}>
                  {NAV_ITEMS.find(n => n.id === activeTab)?.label} - data se brzy objeví
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Map view ─────────────────────────────────────────────────────────────────
function MapView({ onAreaSelected }: { onAreaSelected: (area: SelectedArea) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const czGeoJsonRef = useRef<any>(null);
  const clipLayerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [pointCount, setPointCount] = useState(0);
  const [invalidMsg, setInvalidMsg] = useState<string | null>(null);

  const pointsRef = useRef<[number, number][]>([]);
  const tempMarkersRef = useRef<any[]>([]);
  const tempPolylineRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const maskRef = useRef<any>(null);
  const modeRef = useRef<Mode>("idle");
  const closingRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined" || leafletMapRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const existingScript = document.querySelector('script[src*="leaflet"]');
    if (existingScript) {
      if ((window as any).L) {
        initMap();
      } else {
        existingScript.addEventListener("load", initMap);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = initMap;
    document.head.appendChild(script);

    async function initMap() {
      const L = (window as any).L;
      if (!L) {
        console.error("Leaflet failed to load, cannot initialize map");
        return;
      }
      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [49.75, 15.5], zoom: 8,
        zoomControl: false, minZoom: 7,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      leafletMapRef.current = map;

      let czFeature: any = null;
      try {
        const res = await fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson");
        const data = await res.json();
        czFeature = data.features.find((f: any) => f.properties.ISO_A2 === "CZ");
        czGeoJsonRef.current = czFeature;
      } catch (e) { console.error("Failed to load CZ GeoJSON", e); }

      map.createPane("bgPane").style.zIndex = "199";
      map.createPane("czPane").style.zIndex = "200";

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors © CARTO",
        subdomains: "abcd", maxZoom: 20, pane: "bgPane", opacity: 0.15,
      }).addTo(map);

      const czTileLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "", subdomains: "abcd", maxZoom: 20, pane: "czPane",
      }).addTo(map);
      clipLayerRef.current = czTileLayer;

      if (czFeature) {
        const czBounds = L.geoJSON(czFeature).getBounds();
        map.setMaxBounds(czBounds.pad(0.2));
        map.fitBounds(czBounds, { padding: [40, 40] });

        const applyClip = () => {
          const paneEl = map.getPane("czPane") as HTMLElement;
          if (!paneEl) return;
          const old = paneEl.querySelector("svg.cz-clip");
          if (old) old.remove();
          const size = map.getSize();
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("class", "cz-clip");
          svg.style.cssText = `position:absolute;top:0;left:0;width:${size.x}px;height:${size.y}px;pointer-events:none;overflow:visible;`;
          const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
          const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
          clipPath.setAttribute("id", "cz-clip-path");
          const toPixel = (coord: number[]) => {
            const pt = map.latLngToContainerPoint(L.latLng(coord[1], coord[0]));
            return `${pt.x},${pt.y}`;
          };
          const geom = czFeature.geometry;
          const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
          let d = "";
          polys.forEach((poly: number[][][]) => {
            poly.forEach((ring: number[][]) => {
              d += "M " + ring.map(toPixel).join(" L ") + " Z ";
            });
          });
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", d);
          path.setAttribute("fill-rule", "evenodd");
          clipPath.appendChild(path);
          defs.appendChild(clipPath);
          svg.appendChild(defs);
          paneEl.style.clipPath = "";
          paneEl.insertBefore(svg, paneEl.firstChild);
          paneEl.style.clipPath = `url(#cz-clip-path)`;
        };

        applyClip();
        map.on("moveend zoomend resize viewreset", applyClip);

        L.geoJSON(czFeature, {
          style: { color: "#2e3a1f", weight: 2, fill: false, opacity: 0.7 },
          interactive: false,
        }).addTo(map);
      }

      map.on("click", (e: any) => {
        if (modeRef.current !== "drawing") return;
        if (closingRef.current) return;

        const latlng: [number, number] = [e.latlng.lat, e.latlng.lng];
        const points = pointsRef.current;

        if (points.length >= 3) {
          const first = map.latLngToContainerPoint(L.latLng(points[0]));
          const clicked = map.latLngToContainerPoint(e.latlng);
          const dx = first.x - clicked.x;
          const dy = first.y - clicked.y;
          if (Math.sqrt(dx * dx + dy * dy) < 12) {
            if (closingWouldSelfIntersect(points)) {
              flashInvalid("Can't close — shape would cross itself");
              return;
            }
            closePolygonFn(L, map);
            return;
          }
        }

        if (wouldSelfIntersect(points, latlng)) {
          flashInvalid("Lines can't cross — try a different point");
          return;
        }

        points.push(latlng);
        setPointCount(points.length);
        updateDrawing(L, map);
      });

      setMapReady(true);
    }
  }, []);

  function flashInvalid(msg: string) {
    setInvalidMsg(msg);
    setTimeout(() => setInvalidMsg(null), 2200);
  }

  function updateDrawing(L: any, map: any) {
    const points = pointsRef.current;
    tempMarkersRef.current.forEach((m) => map.removeLayer(m));
    tempMarkersRef.current = [];
    if (tempPolylineRef.current) { map.removeLayer(tempPolylineRef.current); tempPolylineRef.current = null; }
    points.forEach((pt, i) => {
      const isFirst = i === 0;
      const dot = L.circleMarker(pt, {
        radius: isFirst ? 8 : 5,
        color: "#2e3a1f",
        fillColor: isFirst && points.length >= 3 ? "#ACC18A" : "#ffffff",
        fillOpacity: 1,
        weight: isFirst ? 3 : 2,
      }).addTo(map);
      tempMarkersRef.current.push(dot);
    });
    if (points.length > 1) {
      tempPolylineRef.current = L.polyline(points, {
        color: "#2e3a1f", weight: 2, dashArray: "6 4", opacity: 0.8,
      }).addTo(map);
    }
  }

  function closePolygonFn(L: any, map: any) {
    const points = pointsRef.current;
    if (points.length < 3) return;
    closingRef.current = true;

    tempMarkersRef.current.forEach((m) => map.removeLayer(m));
    tempMarkersRef.current = [];
    if (tempPolylineRef.current) { map.removeLayer(tempPolylineRef.current); tempPolylineRef.current = null; }
    if (polygonRef.current) map.removeLayer(polygonRef.current);
    if (maskRef.current) map.removeLayer(maskRef.current);

    const world: [number, number][] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
    maskRef.current = L.polygon([world, points], {
      color: "transparent", fillColor: "#F4F5E0",
      fillOpacity: 0.92, fillRule: "evenodd", interactive: false,
    }).addTo(map);

    polygonRef.current = L.polygon(points, {
      color: "#2e3a1f", weight: 2, fill: false, interactive: false,
    }).addTo(map);

    map.fitBounds(polygonRef.current.getBounds(), { padding: [60, 60], maxZoom: 18 });

    // Compute area data
    const lats = points.map(p => p[0]);
    const lngs = points.map(p => p[1]);
    const selectedArea: SelectedArea = {
      points: [...points],
      bounds: {
        north: Math.max(...lats), south: Math.min(...lats),
        east: Math.max(...lngs), west: Math.min(...lngs),
      },
      areaSqKm: computeAreaSqKm(points),
    };

    pointsRef.current = [];
    setPointCount(0);
    setMode("idle");
    setTimeout(() => { closingRef.current = false; }, 300);

    // Small delay so the user sees the polygon close before navigating
    setTimeout(() => {
      onAreaSelected(selectedArea);
    }, 600);
  }

  function clearAll() {
    const L = (window as any).L;
    const map = leafletMapRef.current;
    if (!L || !map) return;
    tempMarkersRef.current.forEach((m) => map.removeLayer(m));
    tempMarkersRef.current = [];
    if (tempPolylineRef.current) { map.removeLayer(tempPolylineRef.current); tempPolylineRef.current = null; }
    if (polygonRef.current) { map.removeLayer(polygonRef.current); polygonRef.current = null; }
    if (maskRef.current) { map.removeLayer(maskRef.current); maskRef.current = null; }
    pointsRef.current = [];
    setPointCount(0);
    setMode("idle");
  }

  function startDrawing() { clearAll(); setMode("drawing"); }

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.style.cursor = mode === "drawing" ? "crosshair" : "";
  }, [mode]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 64px - 57px)" }}>
      <div ref={mapRef} className="absolute inset-0" />

      {mapReady && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
          {mode === "idle" && (
            <button onClick={startDrawing}
              className="flex items-center gap-2 bg-bg/95 backdrop-blur-md border border-btn/50 rounded-2xl px-5 py-3 shadow-lg hover:border-btn transition-all text-sm font-medium text-text">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                <path d="M2 14L6 10M6 10L2 2L14 6L8 8L6 10Z" stroke="#2e3a1f" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              Draw area
            </button>
          )}
          {mode === "drawing" && (
            <>
              <div className="bg-bg/95 backdrop-blur-md border border-btn/40 rounded-2xl px-5 py-3 shadow-lg text-sm text-text-mid">
                {pointCount === 0 && "Click on the map to place first point"}
                {pointCount === 1 && "Click to add more points"}
                {pointCount === 2 && "Keep clicking to add points"}
                {pointCount >= 3 && "Click the first point to finish"}
              </div>
              <button onMouseDown={(e) => { e.stopPropagation(); clearAll(); }}
                className="flex items-center gap-2 bg-bg/95 backdrop-blur-md border border-btn/40 rounded-2xl px-4 py-3 shadow-lg hover:border-btn transition-all text-sm text-text-mid">
                ✕ Cancel
              </button>
            </>
          )}
        </div>
      )}

      {invalidMsg && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] bg-text text-bg text-sm px-5 py-3 rounded-2xl shadow-lg pointer-events-none">
          ✕ {invalidMsg}
        </div>
      )}

      {!mapReady && (
        <div className="absolute inset-0 bg-bg flex items-center justify-center z-[2000]">
          <div className="text-center">
            <div className="text-5xl mb-4 animate-bounce">🌿</div>
            <p className="font-display text-2xl text-text">Loading map…</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root: controls which "page" is shown ─────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<AppPage>("map");
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);

  function handleAreaSelected(area: SelectedArea) {
    setSelectedArea(area);
    setPage("results");
  }

  function handleBack() {
    setPage("map");
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapView onAreaSelected={handleAreaSelected} />
      {page === "results" && selectedArea && (
        <ResultsPage area={selectedArea} onBack={handleBack} />
      )}
    </div>
  );
}