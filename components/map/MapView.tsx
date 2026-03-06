"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SQUARES, type Square } from "./squareData"; 


function tempToColor(temp: number, alpha = 0.72): string {
  const t = Math.max(0, Math.min(1, (temp - 28) / 27));
  const r = Math.round(30 + t * 225);
  const g = Math.round(180 - t * 160);
  const b = Math.round(200 - t * 190);
  return `rgba(${r},${g},${b},${alpha})`;
}

function tempLabel(temp: number) {
  if (temp < 32) return "Cool";
  if (temp < 38) return "Warm";
  if (temp < 44) return "Hot";
  return "Extreme";
}

const INTERVENTION_ICONS: Record<string, string> = {
  "Tree canopy": "🌳",
  "Reflective paving": "🪨",
  "Misting jets": "💧",
  "Shade canopies": "⛺",
  "Water features": "🌊",
  "Green walls": "🌿",
  "Permeable paving": "🪨",
  "IoT sensors": "📡",
};

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlaysRef = useRef<{ before: any; after: any }[]>([]);
  const [selected, setSelected] = useState<Square>(SQUARES[0]);
  const [mode, setMode] = useState<"before" | "after">("before");
  const [sliderValue, setSliderValue] = useState(50);
  const [mapReady, setMapReady] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // ── Init Leaflet ──────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || leafletMapRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = (window as any).L;
      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [48.5, 10.5],
        zoom: 5,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Tile layer — CartoDB light for our palette
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution: "© OpenStreetMap contributors © CARTO",
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      leafletMapRef.current = map;

      // Add markers + circle overlays per square
      SQUARES.forEach((sq) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:36px;height:36px;border-radius:50%;
            background:${tempToColor(sq.tempBefore)};
            border:3px solid #ACC18A;
            display:flex;align-items:center;justify-content:center;
            font-size:11px;font-weight:600;color:#2e3a1f;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            cursor:pointer;transition:transform .15s;
          ">${sq.tempBefore}°</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([sq.lat, sq.lng], { icon }).addTo(map);
        marker.on("click", () => setSelected(sq));
        markersRef.current.push({ sq, marker });

        // Heat circle overlays
        const before = L.circle([sq.lat, sq.lng], {
          radius: 400,
          color: "transparent",
          fillColor: tempToColor(sq.tempBefore, 0.45),
          fillOpacity: 1,
        }).addTo(map);

        const after = L.circle([sq.lat, sq.lng], {
          radius: 400,
          color: "transparent",
          fillColor: tempToColor(sq.tempAfter, 0.45),
          fillOpacity: 0,
        }).addTo(map);

        overlaysRef.current.push({ before, after });
      });

      setMapReady(true);
    };
    document.head.appendChild(script);
  }, []);

  // ── Update overlays when mode changes ────────────
  useEffect(() => {
    if (!mapReady) return;
    overlaysRef.current.forEach(({ before, after }) => {
      before.setStyle({ fillOpacity: mode === "before" ? 0.45 : 0 });
      after.setStyle({ fillOpacity: mode === "after" ? 0.45 : 0 });
    });

    // Update marker icons
    const L = (window as any).L;
    if (!L) return;
    markersRef.current.forEach(({ sq, marker }) => {
      const temp = mode === "before" ? sq.tempBefore : sq.tempAfter;
      const isSelected = sq.id === selected.id;
      marker.setIcon(
        L.divIcon({
          className: "",
          html: `<div style="
            width:${isSelected ? 44 : 36}px;height:${isSelected ? 44 : 36}px;border-radius:50%;
            background:${tempToColor(temp)};
            border:${isSelected ? "4px solid #2e3a1f" : "3px solid #ACC18A"};
            display:flex;align-items:center;justify-content:center;
            font-size:${isSelected ? 12 : 11}px;font-weight:700;color:#2e3a1f;
            box-shadow:0 ${isSelected ? 4 : 2}px ${isSelected ? 14 : 8}px rgba(0,0,0,0.3);
            cursor:pointer;transition:transform .15s;
          ">${temp}°</div>`,
          iconSize: [isSelected ? 44 : 36, isSelected ? 44 : 36],
          iconAnchor: [isSelected ? 22 : 18, isSelected ? 22 : 18],
        })
      );
    });
  }, [mode, mapReady, selected]);

  // ── Fly to selected square ────────────────────────
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    leafletMapRef.current.flyTo([selected.lat, selected.lng], 14, {
      duration: 1.2,
    });
  }, [selected, mapReady]);

  // ── Slider drag logic ─────────────────────────────
  const handleSliderMove = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderValue(pct);
    setMode(pct < 50 ? "before" : "after");
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      handleSliderMove(clientX);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [handleSliderMove]);

  const tempDrop = selected.tempBefore - selected.tempAfter;
  const currentTemp = mode === "before" ? selected.tempBefore : selected.tempAfter;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── Top bar ── */}
      <div className="bg-bg border-b border-btn/30 px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="font-display text-2xl text-text leading-none">
            Thermal Impact Map
          </h1>
          <p className="text-xs text-text-light mt-0.5">
            Drag the slider or click a marker to explore before &amp; after cooling data
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-3 bg-fg border border-btn/40 rounded-full p-1">
          <button
            onClick={() => setMode("before")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              mode === "before"
                ? "bg-[rgba(220,100,60,0.2)] text-text border border-orange-300/50"
                : "text-text-mid hover:text-text"
            }`}
          >
            🔥 Before
          </button>
          <button
            onClick={() => setMode("after")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              mode === "after"
                ? "bg-btn text-text border border-btn"
                : "text-text-mid hover:text-text"
            }`}
          >
            🌿 After
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-80 flex-shrink-0 bg-bg border-r border-btn/30 flex flex-col overflow-hidden">

          {/* Square list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <p className="text-xs uppercase tracking-widest text-text-light px-2 pt-1 pb-2">
              Transformed Squares
            </p>
            {SQUARES.map((sq) => {
              const drop = sq.tempBefore - sq.tempAfter;
              const isSel = sq.id === selected.id;
              return (
                <button
                  key={sq.id}
                  onClick={() => setSelected(sq)}
                  className={`w-full text-left rounded-xl px-4 py-3 border transition-all ${
                    isSel
                      ? "bg-fg border-btn shadow-sm"
                      : "border-transparent hover:bg-fg/60 hover:border-btn/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm text-text leading-tight">
                        {sq.name}
                      </p>
                      <p className="text-xs text-text-light">{sq.city}</p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: tempToColor(
                          mode === "before" ? sq.tempBefore : sq.tempAfter,
                          0.25
                        ),
                        color: "#2e3a1f",
                      }}
                    >
                      {mode === "before" ? sq.tempBefore : sq.tempAfter}°C
                    </span>
                  </div>
                  {isSel && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-xs bg-btn/30 text-text-mid rounded-full px-2 py-0.5">
                        −{drop}°C
                      </span>
                      <span className="text-xs text-text-light">{sq.year}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected detail panel */}
          <div className="border-t border-btn/30 p-4 bg-fg/50 flex-shrink-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-display text-lg text-text leading-tight">
                  {selected.name}
                </h2>
                <p className="text-xs text-text-light">{selected.city} · {selected.year}</p>
              </div>
              <div
                className="text-center px-3 py-2 rounded-xl"
                style={{ background: tempToColor(currentTemp, 0.2) }}
              >
                <p className="font-display text-2xl text-text leading-none">{currentTemp}°</p>
                <p className="text-xs text-text-light">{tempLabel(currentTemp)}</p>
              </div>
            </div>

            <p className="text-xs text-text-mid leading-relaxed mb-4">
              {selected.description}
            </p>

            {/* Before / after comparison row */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-bg rounded-lg p-2.5 text-center border border-btn/20">
                <p className="text-xs text-text-light uppercase tracking-wide mb-0.5">Before</p>
                <p className="font-display text-xl" style={{ color: tempToColor(selected.tempBefore, 1).replace("rgba", "rgb").replace(/,[\d.]+\)/, ")") }}>
                  {selected.tempBefore}°C
                </p>
              </div>
              <div className="bg-bg rounded-lg p-2.5 text-center border border-btn/20">
                <p className="text-xs text-text-light uppercase tracking-wide mb-0.5">After</p>
                <p className="font-display text-xl" style={{ color: tempToColor(selected.tempAfter, 1).replace("rgba", "rgb").replace(/,[\d.]+\)/, ")") }}>
                  {selected.tempAfter}°C
                </p>
              </div>
            </div>

            {/* Temp drop bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-text-light mb-1">
                <span>Temperature reduction</span>
                <span className="font-semibold text-btn-dark">−{tempDrop}°C</span>
              </div>
              <div className="h-2 rounded-full bg-bg border border-btn/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-btn transition-all duration-700"
                  style={{ width: `${(tempDrop / 15) * 100}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-bg rounded-lg p-2.5 border border-btn/20">
                <p className="text-xs text-text-light">Trees added</p>
                <p className="font-display text-lg text-text">🌳 {selected.treesAdded}</p>
              </div>
              <div className="bg-bg rounded-lg p-2.5 border border-btn/20">
                <p className="text-xs text-text-light">Area cooled</p>
                <p className="font-display text-lg text-text">{(selected.m2Cooled / 1000).toFixed(1)}k m²</p>
              </div>
            </div>

            {/* interventions */}
            <div>
              <p className="text-xs text-text-light uppercase tracking-wide mb-2">Interventions</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.interventions.map((iv: string) => (
                  <span
                    key={iv}
                    className="text-xs bg-bg border border-btn/30 text-text-mid rounded-full px-2.5 py-1"
                  >
                    {INTERVENTION_ICONS[iv] ?? "•"} {iv}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ── Map + slider ── */}
        <div className="flex-1 relative overflow-hidden">

          {/* Map container */}
          <div ref={mapRef} className="absolute inset-0" />

          {/* Before/After slider track */}
          <div
            ref={sliderRef}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-72 select-none"
            onMouseDown={(e) => {
              isDragging.current = true;
              handleSliderMove(e.clientX);
            }}
            onTouchStart={(e) => {
              isDragging.current = true;
              handleSliderMove(e.touches[0].clientX);
            }}
          >
            <div className="bg-bg/90 backdrop-blur-sm border border-btn/40 rounded-2xl px-4 py-3 shadow-lg">
              <div className="flex justify-between text-xs text-text-light mb-2 font-medium">
                <span className="text-orange-500 font-semibold">🔥 Before</span>
                <span className="text-text-mid">Drag to compare</span>
                <span className="text-btn-dark font-semibold">🌿 After</span>
              </div>
              <div className="relative h-6 flex items-center cursor-grab active:cursor-grabbing">
                {/* Track */}
                <div className="w-full h-2 rounded-full overflow-hidden flex">
                  <div className="h-full rounded-l-full" style={{
                    width: `${sliderValue}%`,
                    background: "linear-gradient(to right, rgba(220,100,60,0.6), rgba(220,100,60,0.3))"
                  }} />
                  <div className="h-full rounded-r-full flex-1" style={{
                    background: "linear-gradient(to right, rgba(172,193,138,0.4), rgba(138,163,110,0.7))"
                  }} />
                </div>
                {/* Thumb */}
                <div
                  className="absolute w-6 h-6 rounded-full bg-text border-2 border-bg shadow-md transition-transform hover:scale-110"
                  style={{ left: `calc(${sliderValue}% - 12px)` }}
                />
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="absolute top-4 right-4 z-[1000] bg-bg/90 backdrop-blur-sm border border-btn/30 rounded-xl p-3 shadow">
            <p className="text-xs text-text-light uppercase tracking-widest mb-2">
              Surface temp
            </p>
            {[
              { label: "Cool  <32°C", color: tempToColor(30) },
              { label: "Warm 32–38°C", color: tempToColor(35) },
              { label: "Hot  38–44°C", color: tempToColor(41) },
              { label: "Extreme >44°C", color: tempToColor(49) },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-xs text-text-mid">{label}</span>
              </div>
            ))}
          </div>

          {/* Loading overlay */}
          {!mapReady && (
            <div className="absolute inset-0 bg-bg flex items-center justify-center z-[2000]">
              <div className="text-center">
                <div className="text-4xl mb-3 animate-bounce">🌿</div>
                <p className="font-display text-xl text-text">Loading map…</p>
                <p className="text-xs text-text-light mt-1">Fetching thermal data</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
