"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ParcelEditor, { type GeoElement } from "./ParcelEditor";
import { formatAreaByMagnitude, formatDistanceByMagnitude } from "./areaFormat";
import ClimateMap from "./ClimateMap";
import Image from "next/image";
import { ArrowLeft, LayoutGrid, Thermometer, X, Pencil, type LucideIcon } from "lucide-react";

type Mode = "idle" | "drawing";
type AppPage = "map" | "results" | "editor";

interface SelectedArea {
  points: [number, number][];
  bounds: { north: number; south: number; east: number; west: number };
  areaSqKm: number;
}

function encodeHashPayload(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
}

function decodeHashPayload<T>(value: string): T | null {
  try {
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function serializeArea(area: SelectedArea) {
  return {
    points: area.points.map(([lat, lng]) => [+lat.toFixed(7), +lng.toFixed(7)]),
    bounds: {
      north: +area.bounds.north.toFixed(7),
      south: +area.bounds.south.toFixed(7),
      east: +area.bounds.east.toFixed(7),
      west: +area.bounds.west.toFixed(7),
    },
    areaSqKm: +area.areaSqKm.toFixed(8),
  };
}

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

const MAX_SELECTION_SIDE_KM = 2;

function computeSelectionSizeKm(points: [number, number][]): { widthKm: number; heightKm: number } {
  if (points.length < 2) return { widthKm: 0, heightKm: 0 };
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const north = Math.max(...lats), south = Math.min(...lats);
  const east = Math.max(...lngs), west = Math.min(...lngs);
  const midLat = (north + south) / 2;
  const widthKm = ((east - west) * Math.PI * 6371 * Math.cos((midLat * Math.PI) / 180)) / 180;
  const heightKm = ((north - south) * Math.PI * 6371) / 180;
  return { widthKm: Math.abs(widthKm), heightKm: Math.abs(heightKm) };
}

function exceedsSelectionLimit(points: [number, number][]): boolean {
  const { widthKm, heightKm } = computeSelectionSizeKm(points);
  return widthKm > MAX_SELECTION_SIDE_KM || heightKm > MAX_SELECTION_SIDE_KM;
}

function MiniMap({ area }: { area: SelectedArea }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current || !ref.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(ref.current, {
      zoomControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, touchZoom: false, attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 20, opacity: 0.6,
    }).addTo(map);

    const world: [number, number][] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
    L.polygon([world, area.points], {
      color: "transparent", fillColor: "#F4F5E0",
      fillOpacity: 0.85, fillRule: "evenodd", interactive: false,
    }).addTo(map);

    const poly = L.polygon(area.points, {
      color: "#2e3a1f", weight: 2.5, fill: false, interactive: false,
    }).addTo(map);

    map.fitBounds(poly.getBounds(), { padding: [24, 24] });
  }, []);

  return <div ref={ref} className="w-full h-full" />;
}


const adminUnitsCache = new Map<string, { label: string; value: string }[]>();

function AdminSkeleton() {
  return (
    <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 6 }} className="animate-pulse">
      {[64, 88, 108].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <div style={{ width: 6, height: 12, borderRadius: 1, background: "#2e3a1f0e" }} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ width: 26, height: 7, borderRadius: 2, background: "#2e3a1f10" }} />
            <div style={{ width: w, height: 12, borderRadius: 2, background: "#2e3a1f18" }} />
          </div>
        </div>
      ))}
    </div>
  );
}


const URBAN_SURFACES: { name: string; heat: number; note: string }[] = [
  { name: "Asfalt",          heat: 10, note: "až +50 °C na povrchu, absorbuje skoro vše" },
  { name: "Kovové povrchy",  heat: 9,  note: "lavičky, sloupy — extrémní v přímém slunci" },
  { name: "Tmavá dlažba",    heat: 8,  note: "zadržuje teplo i po západu slunce" },
  { name: "Beton",           heat: 7,  note: "masivní tepelná kapacita, pomalu chladne" },
  { name: "Světlá dlažba",   heat: 5,  note: "žulové kostky, světlá betonová dlažba" },
  { name: "Suchý písek",     heat: 5,  note: "rychle se zahřívá, ale i rychle chladne" },
  { name: "Štěrk",           heat: 4,  note: "propustný pro vodu, ale zahřívá se" },
  { name: "Suchá tráva",     heat: 3,  note: "při suchu ztrácí ochlazující efekt" },
  { name: "Zelená tráva",    heat: 2,  note: "evapotranspirace snižuje okolní teplotu" },
  { name: "Keře / vegetace", heat: 2,  note: "stín + odpařování" },
  { name: "Stromy",          heat: 1,  note: "stín + evapotranspirace — nejúčinnější" },
  { name: "Vodní plocha",    heat: 1,  note: "trvalé ochlazování okolí odpařováním" },
];

function heatColor(heat: number): string {
  const t = (heat - 1) / 9;
  const r = Math.round(39  + t * (192 - 39));
  const g = Math.round(174 + t * (57  - 174));
  const b = Math.round(96  + t * (43  - 96));
  return `rgb(${r},${g},${b})`;
}

function UrbanSurfaceTierlist() {
  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: "#2e3a1f66", whiteSpace: "nowrap" }}>chladí</span>
        <div style={{
          flex: 1, height: 6, borderRadius: 99,
          background: "linear-gradient(to right, #27ae60, #f1c40f, #c0392b)",
        }} />
        <span style={{ fontSize: 10, color: "#2e3a1f66", whiteSpace: "nowrap" }}>zahřívá</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {URBAN_SURFACES.map((s) => {
          const color = heatColor(s.heat);
          const pct = ((s.heat - 1) / 9) * 100;
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 100, flexShrink: 0, position: "relative", height: 3, background: "#2e3a1f0e", borderRadius: 99 }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 12, color: "#2e3a1f", fontWeight: 600, minWidth: 110 }}>{s.name}</span>
              <span style={{ fontSize: 10, color: "#2e3a1f55", fontStyle: "italic" }}>{s.note}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminUnits({ area }: { area: SelectedArea }) {
  const [levels, setLevels] = useState<{ label: string; value: string }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLevels(null);
    setLoading(true);
    setError(false);
    const lat = ((area.bounds.north + area.bounds.south) / 2).toFixed(6);
    const lon = ((area.bounds.east + area.bounds.west) / 2).toFixed(6);
    const cacheKey = `${lat},${lon}`;
    const cachedLevels = adminUnitsCache.get(cacheKey);
    if (cachedLevels) { setLevels(cachedLevels); setLoading(false); return; }
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&addressdetails=1`, {
      headers: { "Accept-Language": "cs" },
    })
      .then(r => r.json())
      .then(data => {
        const a = data.address ?? {};
        const rows = [
          { label: "Obec",  value: a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet },
          { label: "Okres", value: a.county },
          { label: "Kraj",  value: a.state },
        ].filter((row): row is { label: string; value: string } => typeof row.value === "string");
        adminUnitsCache.set(cacheKey, rows);
        setLevels(rows);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [area]);

  if (loading) return <AdminSkeleton />;
  if (error) return <div style={{ padding: "16px 20px", fontSize: 12, color: "#2e3a1f44", fontStyle: "italic" }}>Data nejsou dostupná</div>;

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 4 }}>
        {(levels ?? []).map(({ label, value }, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ color: "#2e3a1f33", fontSize: 14, lineHeight: 1, marginRight: 2 }}>›</span>}
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f55", marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#2e3a1f", fontStyle: "italic" }}>{value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


const NAV_ITEMS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Přehled", Icon: LayoutGrid },
  { id: "climate",  label: "Klima",   Icon: Thermometer },
];

function ParcelChoiceDialog({
  parcelIndex, area, onContinue, onAddAnother,
}: {
  parcelIndex: number; area: SelectedArea; onContinue: () => void; onAddAnother: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-[2500] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(244,245,224,0.4)", backdropFilter: "blur(2px)" }}
    >
      <div style={{
        background: "#F4F5E0", border: "1.5px solid #2e3a1f22", borderRadius: 12,
        padding: "20px 24px", maxWidth: 360, width: "calc(100% - 40px)",
        boxShadow: "0 8px 40px #0003",
        fontFamily: "'PT Sans', sans-serif",
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 3 }}>
          Parcela {parcelIndex} vybrána
        </div>
        <div style={{ fontSize: 18, color: "#2e3a1f", fontStyle: "italic", marginBottom: 18 }}>
          {formatAreaByMagnitude(area.areaSqKm)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onAddAnother}
            style={{
              flex: 1, padding: "10px 14px", background: "none",
              border: "1.5px solid #2e3a1f33", borderRadius: 8,
              cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              color: "#2e3a1f88", letterSpacing: "0.04em",
            }}
          >
            + Přidat parcelu
          </button>
          <button
            onClick={onContinue}
            style={{
              flex: 1, padding: "10px 14px", background: "#2e3a1f",
              border: "none", borderRadius: 8,
              cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              color: "#F4F5E0", letterSpacing: "0.04em",
            }}
          >
            Pokračovat →
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsPage({
  areas, onBack, onOpenEditor,
}: {
  areas: SelectedArea[]; onBack: () => void; onOpenEditor: () => void;
}) {
  const [activeParcelIdx, setActiveParcelIdx] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const [visible, setVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const [mountedParcels, setMountedParcels] = useState<Set<number>>(() => new Set([0]));

  const area = areas[Math.min(activeParcelIdx, areas.length - 1)];

  useEffect(() => {
    setMountedParcels(prev => { const s = new Set(prev); s.add(activeParcelIdx); return s; });
  }, [activeParcelIdx]);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  function showToast(message: string) {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }

  function shareSummary() {
    const payload = {
      v: 2,
      areas: areas.map(serializeArea),
    };
    const shareUrl = `${window.location.origin}${window.location.pathname}#summary=${encodeHashPayload(payload)}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast("Odkaz zkopírován do schránky");
    });
  }

  return (
    <div
      className="absolute inset-0 z-[3000] flex flex-col"
      style={{
        background: "#F4F5E0",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(18px)",
        transition: "opacity 0.38s ease, transform 0.38s ease",
        fontFamily: "'PT Sans', sans-serif",
      }}
    >
      {/* Header */}
      <header className="flex items-center flex-shrink-0" style={{ borderBottom: "1.5px solid #2e3a1f22", background: "#F4F5E0", height: 56 }}>
        <button onClick={onBack} className="flex items-center gap-2 h-full px-4 sm:px-5 shrink-0" style={{ background: "none", border: "none", borderRight: "1.5px solid #2e3a1f22", cursor: "pointer", color: "#2e3a1f", fontSize: 13, fontFamily: "inherit", letterSpacing: "0.04em" }}>
          <ArrowLeft size={17} />
          <span className="hidden sm:inline">Zpět na mapu</span>
        </button>
        <div className="flex-1 px-3 sm:px-6 flex items-center gap-2 overflow-hidden min-w-0">
          <span className="hidden sm:inline" style={{ fontSize: 11, letterSpacing: "0.12em", color: "#2e3a1f88", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {areas.length > 1 ? `Parcela ${activeParcelIdx + 1} z ${areas.length}` : "Vybraná oblast"}
          </span>
          <span className="hidden sm:inline" style={{ color: "#2e3a1f44", fontSize: 11 }}>·</span>
          <span className="truncate" style={{ fontSize: 13, color: "#2e3a1f", fontStyle: "italic" }}>{formatAreaByMagnitude(area.areaSqKm)}</span>
          <span className="hidden sm:inline" style={{ color: "#2e3a1f44", fontSize: 11 }}>·</span>
          <span className="hidden sm:inline" style={{ fontSize: 13, color: "#2e3a1f99", whiteSpace: "nowrap" }}>{area.points.length} vrcholů</span>
        </div>
        <div className="flex items-center h-full shrink-0" style={{ borderLeft: "1.5px solid #2e3a1f22" }}>
          {["Sdílet"].map((label) => (
            <button key={label} className="hidden sm:block h-full px-4 sm:px-5" style={{ background: "none", border: "none", borderRight: "1.5px solid #2e3a1f22", cursor: "pointer", color: "#2e3a1f99", fontSize: 13, fontFamily: "inherit", letterSpacing: "0.04em" }} onClick={shareSummary}>
              {label}
            </button>
          ))}
          <button onClick={onOpenEditor} className="h-full px-4 sm:px-5 whitespace-nowrap" style={{ background: "#2e3a1f", border: "none", cursor: "pointer", color: "#F4F5E0", fontSize: 13, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            <span className="hidden sm:inline">Otevřít v plánovači →</span>
            <span className="sm:hidden">Plánovač →</span>
          </button>
        </div>
      </header>

      {/* Parcel tabs — only when multiple parcels selected */}
      {areas.length > 1 && (
        <div className="flex flex-shrink-0" style={{ borderBottom: "1.5px solid #2e3a1f22", background: "#F4F5E0", paddingLeft: 4 }}>
          {areas.map((a, idx) => (
            <button
              key={idx}
              onClick={() => setActiveParcelIdx(idx)}
              style={{
                padding: "8px 18px",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, letterSpacing: "0.06em",
                color: activeParcelIdx === idx ? "#2e3a1f" : "#2e3a1f66",
                borderBottom: activeParcelIdx === idx ? "2.5px solid #2e3a1f" : "2.5px solid transparent",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              Parcela {idx + 1}
              <span style={{ marginLeft: 6, fontSize: 11, fontStyle: "italic", opacity: 0.7 }}>
                {formatAreaByMagnitude(a.areaSqKm)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
        {/* Mobile: horizontal tab bar */}
        <nav className="sm:hidden flex flex-shrink-0" style={{ borderBottom: "1.5px solid #2e3a1f22", background: "#F4F5E0" }}>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3"
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.04em", color: activeTab === item.id ? "#2e3a1f" : "#2e3a1f66", borderBottom: activeTab === item.id ? "2.5px solid #2e3a1f" : "2.5px solid transparent", transition: "all 0.15s ease" }}>
              <item.Icon size={15} style={{ opacity: activeTab === item.id ? 1 : 0.5 }} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Desktop: vertical sidebar */}
        <nav className="hidden sm:flex flex-col flex-shrink-0" style={{ width: 180, borderRight: "1.5px solid #2e3a1f22", padding: "24px 0" }}>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 24px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.04em", color: activeTab === item.id ? "#2e3a1f" : "#2e3a1f66", borderLeft: activeTab === item.id ? "2.5px solid #2e3a1f" : "2.5px solid transparent", transition: "all 0.15s ease" }}>
              <item.Icon size={15} style={{ opacity: activeTab === item.id ? 1 : 0.5 }} />
              {item.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-auto p-4 sm:p-8 md:px-10">
          {areas.map((a, idx) => {
            if (!mountedParcels.has(idx)) return null;
            const isActive = idx === activeParcelIdx;
            const { bounds: b, areaSqKm: aSqKm, points: aPts } = a;
            const aCenterLat = ((b.north + b.south) / 2).toFixed(4);
            const aCenterLng = ((b.east + b.west) / 2).toFixed(4);
            const aWidthKm = Math.abs(((b.east - b.west) * Math.PI * 6371 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180)) / 180);
            const aHeightKm = Math.abs(((b.north - b.south) * Math.PI * 6371) / 180);
            return (
              <div key={idx} style={{ display: isActive ? undefined : "none" }}>
                <div style={{ maxWidth: 820, display: activeTab === "overview" ? undefined : "none" }}>
                  <h1 style={{ fontSize: 28, fontWeight: 400, color: "#2e3a1f", marginBottom: 6, lineHeight: 1.2, fontStyle: "italic" }}>
                    {areas.length > 1 ? `Parcela ${idx + 1}` : "Vlastní oblast"}
                  </h1>
                  <p style={{ fontSize: 13, color: "#2e3a1f77", marginBottom: 24, letterSpacing: "0.04em" }}>
                    Nakresleno v České republice · {new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-8">
                    <div className="w-full sm:w-[280px] lg:w-[320px] h-[180px] sm:h-[220px] flex-shrink-0" style={{ border: "1.5px solid #2e3a1f22", borderRadius: 4, overflow: "hidden" }}>
                      <MiniMap area={a} />
                    </div>
                    <div className="flex-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#2e3a1f18", border: "1.5px solid #2e3a1f22", borderRadius: 4, overflow: "hidden" }}>
                      {[
                        { label: "Celková plocha", value: formatAreaByMagnitude(aSqKm) },
                        { label: "Vrcholy",         value: aPts.length },
                        { label: "Šířka",           value: formatDistanceByMagnitude(aWidthKm) },
                        { label: "Výška",           value: formatDistanceByMagnitude(aHeightKm) },
                        { label: "Střed. šířka",    value: `${aCenterLat}° N` },
                        { label: "Střed. délka",    value: `${aCenterLng}° E` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: "#F4F5E0", padding: "12px 16px" }}>
                          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 18, color: "#2e3a1f", fontStyle: "italic" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {[
                    { title: "Správní celky",       content: <AdminUnits area={a} /> },
                    { title: "Tierlist povrchů ve městě", content: <UrbanSurfaceTierlist /> },
                  ].map(({ title, content }) => (
                    <div key={title} style={{ border: "1.5px solid #2e3a1f22", borderRadius: 4, marginBottom: 16, overflow: "hidden" }}>
                      <div style={{ padding: "14px 20px", borderBottom: "1.5px solid #2e3a1f22" }}>
                        <span style={{ fontSize: 13, color: "#2e3a1f", letterSpacing: "0.04em" }}>{title}</span>
                      </div>
                      {content}
                    </div>
                  ))}
                </div>
                {isActive && activeTab === "climate" && (
                  <div style={{ maxWidth: 900 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 400, color: "#2e3a1f", marginBottom: 6, lineHeight: 1.2, fontStyle: "italic" }}>Klima</h1>
                    <p style={{ fontSize: 13, color: "#2e3a1f77", marginBottom: 20, letterSpacing: "0.04em" }}>
                      Aktuální teplotní pole v okolí vybrané parcely (zdroj: Open-Meteo).
                    </p>
                    <ClimateMap area={a} height={360} mode="czech" />
                  </div>
                )}
                {isActive && activeTab !== "overview" && activeTab !== "climate" && (
                  <div style={{ maxWidth: 820 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 400, color: "#2e3a1f", marginBottom: 6, lineHeight: 1.2, fontStyle: "italic" }}>{NAV_ITEMS.find(n => n.id === activeTab)?.label}</h1>
                    <p style={{ fontSize: 13, color: "#2e3a1f77", marginBottom: 36, letterSpacing: "0.04em" }}>Tato sekce se připravuje.</p>
                    <div style={{ border: "1.5px dashed #2e3a1f33", borderRadius: 4, padding: "60px 40px", textAlign: "center" }}>
                      <div style={{ marginBottom: 12, opacity: 0.3, display: "flex", justifyContent: "center" }}>
                      {(() => { const n = NAV_ITEMS.find(x => x.id === activeTab); return n ? <n.Icon size={32} /> : null; })()}
                    </div>
                      <p style={{ fontSize: 14, color: "#2e3a1f55", fontStyle: "italic" }}>Data sekce {NAV_ITEMS.find(n => n.id === activeTab)?.label} již brzy</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </main>
      </div>

      {toastMessage && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "#2e3a1f", color: "#F4F5E0", padding: "10px 22px",
          borderRadius: 999, fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em",
          zIndex: 9999, pointerEvents: "none",
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}


const MapView = forwardRef<{ startNewDrawing: () => void }, { onAreaSelected: (area: SelectedArea) => void }>(
  function MapView({ onAreaSelected }, ref) {
    const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    const SATELLITE_TILES = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMapRef = useRef<any>(null);
    const czGeoJsonRef = useRef<any>(null);
    const bgLayerRef = useRef<any>(null);
    const clipLayerRef = useRef<any>(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapStyle, setMapStyle] = useState<"light" | "satellite">("light");
    const [mode, setMode] = useState<Mode>("idle");
    const [pointCount, setPointCount] = useState(0);
    const [invalidMsg, setInvalidMsg] = useState<string | null>(null);

    const pointsRef = useRef<[number, number][]>([]);
    const tempMarkersRef = useRef<any[]>([]);
    const tempPolylineRef = useRef<any>(null);
    const finalizedPolygonLayersRef = useRef<any[]>([]);
    const combinedMaskRef = useRef<any>(null);
    const finalizedAreasRef = useRef<SelectedArea[]>([]);
    const modeRef = useRef<Mode>("idle");
    const closingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      startNewDrawing() {
        clearInProgress();
        const map = leafletMapRef.current;
        if (map && combinedMaskRef.current) {
          map.removeLayer(combinedMaskRef.current);
          combinedMaskRef.current = null;
        }
        setMode("drawing");
      },
    }));

    useEffect(() => { modeRef.current = mode; }, [mode]);

    useEffect(() => {
      if (typeof window === "undefined" || leafletMapRef.current) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const existingScript = document.querySelector('script[src*="leaflet"]');
      if (existingScript) {
        if ((window as any).L) { initMap(); }
        else { existingScript.addEventListener("load", initMap); }
        return;
      }

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = initMap;
      document.head.appendChild(script);

      async function initMap() {
        const L = (window as any).L;
        if (!L || !mapRef.current || leafletMapRef.current) return;

        const map = L.map(mapRef.current, {
          center: [49.75, 15.5],
          zoom: 8,
          zoomControl: false,
          minZoom: 7, maxZoom: 19,
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

        bgLayerRef.current = L.tileLayer(LIGHT_TILES, { attribution: "© OpenStreetMap contributors © CARTO", subdomains: "abcd", maxZoom: 19, pane: "bgPane", opacity: 0.15 }).addTo(map);
        clipLayerRef.current = L.tileLayer(LIGHT_TILES, { attribution: "", subdomains: "abcd", maxZoom: 19, pane: "czPane" }).addTo(map);

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
              poly.forEach((ring: number[][]) => { d += "M " + ring.map(toPixel).join(" L ") + " Z "; });
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
          L.geoJSON(czFeature, { style: { color: "#2e3a1f", weight: 2, fill: false, opacity: 0.7 }, interactive: false }).addTo(map);
        }

        map.on("click", (e: any) => {
          if (modeRef.current !== "drawing") return;
          if (closingRef.current) return;

          const latlng: [number, number] = [e.latlng.lat, e.latlng.lng];
          const points = pointsRef.current;

          if (points.length >= 3) {
            const first = map.latLngToContainerPoint(L.latLng(points[0]));
            const clicked = map.latLngToContainerPoint(e.latlng);
            const dx = first.x - clicked.x, dy = first.y - clicked.y;
            if (Math.sqrt(dx * dx + dy * dy) < 12) {
              if (closingWouldSelfIntersect(points)) { flashInvalid("Nelze uzavřít, tvar by se protínal"); return; }
              if (exceedsSelectionLimit(points)) { flashInvalid("Maximální velikost označení je 2 km × 2 km"); return; }
              closePolygonFn(L, map);
              return;
            }
          }

          if (wouldSelfIntersect(points, latlng)) { flashInvalid("Čáry se nesmí křížit, zkuste jiný bod"); return; }
          if (exceedsSelectionLimit([...points, latlng])) { flashInvalid("Maximální velikost označení je 2 km × 2 km"); return; }

          points.push(latlng);
          setPointCount(points.length);
          updateDrawing(L, map);
        });

        setMapReady(true);
      }
    }, []);

    useEffect(() => {
      const bgLayer = bgLayerRef.current;
      const clipLayer = clipLayerRef.current;
      if (!bgLayer || !clipLayer) return;
      const isSatellite = mapStyle === "satellite";
      const tileUrl = isSatellite ? SATELLITE_TILES : LIGHT_TILES;
      bgLayer.setUrl(tileUrl);
      clipLayer.setUrl(tileUrl);
      bgLayer.setOpacity(isSatellite ? 0.28 : 0.15);
    }, [mapStyle]);

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
        const dot = L.circleMarker(pt, { radius: isFirst ? 8 : 5, color: "#2e3a1f", fillColor: isFirst && points.length >= 3 ? "#ACC18A" : "#ffffff", fillOpacity: 1, weight: isFirst ? 3 : 2 }).addTo(map);
        tempMarkersRef.current.push(dot);
      });
      if (points.length > 1) {
        tempPolylineRef.current = L.polyline(points, { color: "#2e3a1f", weight: 2, dashArray: "6 4", opacity: 0.8 }).addTo(map);
      }
    }

    function closePolygonFn(L: any, map: any) {
      const points = pointsRef.current;
      if (points.length < 3) return;
      if (exceedsSelectionLimit(points)) { flashInvalid("Maximální velikost označení je 2 km × 2 km"); return; }
      closingRef.current = true;

      tempMarkersRef.current.forEach((m) => map.removeLayer(m));
      tempMarkersRef.current = [];
      if (tempPolylineRef.current) { map.removeLayer(tempPolylineRef.current); tempPolylineRef.current = null; }

      // Add outline for this finalized polygon
      const outlineLayer = L.polygon(points, { color: "#2e3a1f", weight: 2, fill: false, interactive: false }).addTo(map);
      finalizedPolygonLayersRef.current.push(outlineLayer);

      // Rebuild combined mask with all areas (including the new one) as holes
      if (combinedMaskRef.current) { map.removeLayer(combinedMaskRef.current); }
      const allHoles = [...finalizedAreasRef.current.map(a => a.points), points];
      const world: [number, number][] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
      combinedMaskRef.current = L.polygon([world, ...allHoles], {
        color: "transparent", fillColor: "#F4F5E0", fillOpacity: 0.92, fillRule: "evenodd", interactive: false,
      }).addTo(map);

      map.fitBounds(L.polygon(points).getBounds(), { padding: [60, 60], maxZoom: 19 });

      const lats = points.map(p => p[0]);
      const lngs = points.map(p => p[1]);
      const selectedArea: SelectedArea = {
        points: [...points],
        bounds: { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) },
        areaSqKm: computeAreaSqKm(points),
      };

      finalizedAreasRef.current = [...finalizedAreasRef.current, selectedArea];

      pointsRef.current = [];
      setPointCount(0);
      setMode("idle");
      setTimeout(() => { closingRef.current = false; }, 300);
      setTimeout(() => { onAreaSelected(selectedArea); }, 600);
    }

    function clearInProgress() {
      const map = leafletMapRef.current;
      if (!map) return;
      tempMarkersRef.current.forEach((m) => map.removeLayer(m));
      tempMarkersRef.current = [];
      if (tempPolylineRef.current) { map.removeLayer(tempPolylineRef.current); tempPolylineRef.current = null; }
      pointsRef.current = [];
      setPointCount(0);
    }

    function clearAll() {
      const map = leafletMapRef.current;
      if (map) {
        tempMarkersRef.current.forEach((m) => map.removeLayer(m));
        if (tempPolylineRef.current) { map.removeLayer(tempPolylineRef.current); }
        finalizedPolygonLayersRef.current.forEach(l => map.removeLayer(l));
        if (combinedMaskRef.current) { map.removeLayer(combinedMaskRef.current); }
      }
      tempMarkersRef.current = [];
      tempPolylineRef.current = null;
      finalizedPolygonLayersRef.current = [];
      combinedMaskRef.current = null;
      finalizedAreasRef.current = [];
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
          <div className="absolute top-5 left-5 z-[1000] bg-bg/95 backdrop-blur-md border border-btn/40 rounded-2xl p-1.5 flex items-center gap-1 shadow-lg">
            <button onClick={() => setMapStyle("light")} className={`px-3 py-1.5 rounded-xl text-xs tracking-wide transition-all ${mapStyle === "light" ? "bg-text text-bg" : "text-text-mid hover:bg-bg/70"}`}>Mapa</button>
            <button onClick={() => setMapStyle("satellite")} className={`px-3 py-1.5 rounded-xl text-xs tracking-wide transition-all ${mapStyle === "satellite" ? "bg-text text-bg" : "text-text-mid hover:bg-bg/70"}`}>Satelit</button>
          </div>
        )}

        {mapReady && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
            {mode === "idle" && (
              <button onClick={startDrawing} className="flex items-center gap-2 bg-bg/95 backdrop-blur-md border border-btn/50 rounded-2xl px-5 py-3 shadow-lg hover:border-btn transition-all text-sm font-medium text-text">
                <Pencil size={16} className="flex-shrink-0" />
                Nakreslit oblast
              </button>
            )}
            {mode === "drawing" && (
              <>
                <div className="bg-bg/95 backdrop-blur-md border border-btn/40 rounded-2xl px-5 py-3 shadow-lg text-sm text-text-mid">
                  {pointCount === 0 && "Klikněte na mapu pro první bod"}
                  {pointCount === 1 && "Klikněte pro přidání dalších bodů"}
                  {pointCount === 2 && "Pokračujte klikáním pro další body"}
                  {pointCount >= 3 && "Klikněte na první bod pro dokončení"}
                </div>
                <button onMouseDown={(e) => { e.stopPropagation(); clearAll(); }} className="flex items-center gap-2 bg-bg/95 backdrop-blur-md border border-btn/40 rounded-2xl px-4 py-3 shadow-lg hover:border-btn transition-all text-sm text-text-mid">
                  <X size={14} /> Zrušit
                </button>
              </>
            )}
          </div>
        )}

        {invalidMsg && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] bg-text text-bg text-sm px-5 py-3 rounded-2xl shadow-lg pointer-events-none flex items-center gap-2">
            <X size={14} /> {invalidMsg}
          </div>
        )}

        {!mapReady && (
          <div className="absolute inset-0 bg-bg flex items-center justify-center z-[2000]">
            <div className="text-center">
              <div className="flex items-center justify-center text-5xl mb-4 animate-bounce">
                <Image src="/logo.svg" alt="Logo" width={48} height={48} />
              </div>
              <p className="font-display text-2xl text-text">Načítání mapy…</p>
            </div>
          </div>
        )}
      </div>
    );
  }
);


export default function App() {
  const [page, setPage] = useState<AppPage>("map");
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [showParcelDialog, setShowParcelDialog] = useState(false);
  const [initialPlan, setInitialPlan] = useState<GeoElement[] | undefined>(undefined);
  const mapViewRef = useRef<{ startNewDrawing: () => void }>(null);
  const pendingAreasRef = useRef<SelectedArea[]>([]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#summary=")) {
      const data = decodeHashPayload<{ v: number; area?: SelectedArea; areas?: SelectedArea[] }>(hash.slice(9));
      if (data?.v === 2 && Array.isArray(data.areas) && data.areas.length > 0) {
        setSelectedAreas(data.areas);
        setPage("results");
      } else if (data?.v === 1 && data.area?.points) {
        setSelectedAreas([data.area]);
        setInitialPlan(undefined);
        setPage("results");
      }
      return;
    }
    if (hash.startsWith("#plan=")) {
      const data = decodeHashPayload<{ v: number; area?: SelectedArea; elements?: GeoElement[] }>(hash.slice(6));
      if (data?.v === 1 && data.area?.points && Array.isArray(data.elements)) {
        setSelectedAreas([data.area]);
        setInitialPlan(data.elements);
        setPage("editor");
      }
    }
  }, []);

  function handleAreaSelected(area: SelectedArea) {
    pendingAreasRef.current = [...pendingAreasRef.current, area];
    setShowParcelDialog(true);
  }

  function handleContinueToResults() {
    setSelectedAreas(pendingAreasRef.current);
    setShowParcelDialog(false);
    setInitialPlan(undefined);
    setPage("results");
  }

  function handleAddAnother() {
    setShowParcelDialog(false);
    mapViewRef.current?.startNewDrawing();
  }

  function handleBack() {
    setPage("map");
    pendingAreasRef.current = [];
    setSelectedAreas([]);
  }

  const pendingArea = pendingAreasRef.current[pendingAreasRef.current.length - 1];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapView ref={mapViewRef} onAreaSelected={handleAreaSelected} />

      {showParcelDialog && pendingArea && (
        <ParcelChoiceDialog
          parcelIndex={pendingAreasRef.current.length}
          area={pendingArea}
          onContinue={handleContinueToResults}
          onAddAnother={handleAddAnother}
        />
      )}

      {page === "results" && selectedAreas.length > 0 && (
        <ResultsPage
          areas={selectedAreas}
          onBack={handleBack}
          onOpenEditor={() => setPage("editor")}
        />
      )}

      {page === "editor" && selectedAreas.length > 0 && (
        <ParcelEditor
          areas={selectedAreas}
          onBack={() => setPage("results")}
          initialPlan={initialPlan}
        />
      )}
    </div>
  );
}
