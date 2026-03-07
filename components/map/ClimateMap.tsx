"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ClimateArea {
  points: [number, number][];
  bounds: { north: number; south: number; east: number; west: number };
}

interface ClimateSample {
  lat: number;
  lng: number;
  temperature: number;
  time: string;
}

const PARCEL_GRID_SIZE = 5;
const CZECH_GRID_SIZE = 20;
const climateCache = new Map<string, Promise<ClimateSample[]>>();
let leafletLoader: Promise<any> | null = null;
const CZECH_BOUNDS = {
  north: 51.10,
  south: 48.50,
  east: 18.95,
  west: 12.05,
};
const CZECH_GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet can only be loaded in browser"));
  }
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletLoader) return leafletLoader;

  leafletLoader = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-climate-leaflet="1"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-climate-leaflet", "1");
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector('script[data-climate-leaflet="1"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve((window as any).L));
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Leaflet script")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.setAttribute("data-climate-leaflet", "1");
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error("Failed to load Leaflet script"));
    document.head.appendChild(script);
  });

  return leafletLoader;
}

function buildSampleGrid(bounds: ClimateArea["bounds"], gridSize: number, expandRatio = 0.3): [number, number][] {
  const latSpan = Math.max(bounds.north - bounds.south, 0.02);
  const lngSpan = Math.max(bounds.east - bounds.west, 0.03);
  const latStart = bounds.south - latSpan * expandRatio;
  const latEnd = bounds.north + latSpan * expandRatio;
  const lngStart = bounds.west - lngSpan * expandRatio;
  const lngEnd = bounds.east + lngSpan * expandRatio;
  const points: [number, number][] = [];
  for (let y = 0; y < gridSize; y++) {
    const tY = y / (gridSize - 1);
    const lat = latStart + (latEnd - latStart) * tY;
    for (let x = 0; x < gridSize; x++) {
      const tX = x / (gridSize - 1);
      const lng = lngStart + (lngEnd - lngStart) * tX;
      points.push([lat, lng]);
    }
  }
  return points;
}

async function fetchClimateSamples(bounds: ClimateArea["bounds"], gridSize: number, expandRatio = 0.3): Promise<ClimateSample[]> {
  const key = `${gridSize}:${expandRatio}:${bounds.north.toFixed(4)}:${bounds.south.toFixed(4)}:${bounds.east.toFixed(4)}:${bounds.west.toFixed(4)}`;
  const cached = climateCache.get(key);
  if (cached) return cached;

  const request = (async () => {
    const samplePoints = buildSampleGrid(bounds, gridSize, expandRatio);
    const chunkSize = 24;
    const chunks: [number, number][][] = [];
    for (let i = 0; i < samplePoints.length; i += chunkSize) {
      chunks.push(samplePoints.slice(i, i + chunkSize));
    }

    const samples: ClimateSample[] = [];
    for (const chunk of chunks) {
      const latCsv = chunk.map(([lat]) => lat.toFixed(5)).join(",");
      const lngCsv = chunk.map(([, lng]) => lng.toFixed(5)).join(",");
      const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
      endpoint.searchParams.set("latitude", latCsv);
      endpoint.searchParams.set("longitude", lngCsv);
      endpoint.searchParams.set("current", "temperature_2m");
      endpoint.searchParams.set("timezone", "auto");

      const json = await fetchWithRetry(endpoint.toString(), 4);
      const parsed = parseBatchResponse(json, chunk);
      samples.push(...parsed);
    }

    return samples;
  })();

  climateCache.set(key, request);
  return request;
}

async function fetchWithRetry(url: string, maxRetries: number): Promise<any> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const waitMs = Math.min(6000, 450 * 2 ** attempt) + Math.floor(Math.random() * 220);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      if (!res.ok) throw new Error(`Open-Meteo request failed with ${res.status}`);
      return await res.json();
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const waitMs = Math.min(4000, 350 * 2 ** attempt) + Math.floor(Math.random() * 120);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastErr ?? new Error("Open-Meteo request failed");
}

function parseBatchResponse(json: any, fallbackPoints: [number, number][]): ClimateSample[] {
  const rows = Array.isArray(json) ? json : [json];
  const temps: number[] = [];
  let time = "";

  rows.forEach((row: any) => {
    if (Array.isArray(row?.current)) {
      row.current.forEach((entry: any) => {
        if (typeof entry?.temperature_2m === "number") temps.push(entry.temperature_2m);
        if (!time && entry?.time) time = String(entry.time);
      });
      return;
    }
    if (Array.isArray(row?.current?.temperature_2m)) {
      row.current.temperature_2m.forEach((t: any) => {
        if (typeof t === "number") temps.push(t);
      });
      if (!time && row?.current?.time) {
        if (Array.isArray(row.current.time)) time = String(row.current.time[0] ?? "");
        else time = String(row.current.time);
      }
      return;
    }
    if (typeof row?.current?.temperature_2m === "number") {
      temps.push(row.current.temperature_2m);
      if (!time && row?.current?.time) time = String(row.current.time);
      return;
    }
  });

  if (temps.length === 0) {
    throw new Error("Open-Meteo response missing current.temperature_2m");
  }

  if (temps.length === 1 && fallbackPoints.length > 1) {
    return fallbackPoints.map(([lat, lng]) => ({
      lat,
      lng,
      temperature: temps[0],
      time,
    }));
  }

  if (temps.length !== fallbackPoints.length) {
    throw new Error(`Open-Meteo batch size mismatch (${temps.length} vs ${fallbackPoints.length})`);
  }

  return fallbackPoints.map(([lat, lng], i) => ({
    lat,
    lng,
    temperature: temps[i],
    time,
  }));
}

function geoBoundsToClimateBounds(bounds: any): ClimateArea["bounds"] {
  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  };
}

function featureToLatLngRings(feature: any): [number, number][][] {
  const geom = feature?.geometry;
  if (!geom) return [];
  const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const rings: [number, number][][] = [];
  polygons.forEach((poly: number[][][]) => {
    poly.forEach((ring: number[][]) => {
      rings.push(ring.map((coord) => [coord[1], coord[0]]));
    });
  });
  return rings;
}

async function loadCzechFeature(): Promise<any | null> {
  try {
    const res = await fetch(CZECH_GEOJSON_URL);
    if (!res.ok) return null;
    const json = await res.json();
    const feature = json?.features?.find((f: any) => f?.properties?.ISO_A2 === "CZ");
    return feature ?? null;
  } catch {
    return null;
  }
}

function colorFromTemperature(temp: number, min: number, max: number): string {
  const safeSpan = Math.max(max - min, 0.001);
  const t = Math.min(1, Math.max(0, (temp - min) / safeSpan));
  const hue = 210 - t * 180;
  return `hsl(${hue}, 72%, 52%)`;
}

function parseHslColor(hsl: string): [number, number, number] {
  const match = /hsl\(([-\d.]+),\s*([-\d.]+)%?,\s*([-\d.]+)%?\)/i.exec(hsl);
  if (!match) return [120, 120, 120];
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function buildContinuousOverlay(
  L: any,
  samples: ClimateSample[],
  bounds: ClimateArea["bounds"],
  gridSize: number,
  minTemp: number,
  maxTemp: number
) {
  const expected = gridSize * gridSize;
  if (samples.length !== expected) return null;

  const width = 1024;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const temps2d: number[][] = [];
  for (let y = 0; y < gridSize; y++) {
    temps2d.push(samples.slice(y * gridSize, (y + 1) * gridSize).map((s) => s.temperature));
  }

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let py = 0; py < height; py++) {
    const gy = (py / (height - 1)) * (gridSize - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(gridSize - 1, y0 + 1);
    const fy = gy - y0;
    for (let px = 0; px < width; px++) {
      const gx = (px / (width - 1)) * (gridSize - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(gridSize - 1, x0 + 1);
      const fx = gx - x0;

      const t00 = temps2d[y0][x0];
      const t10 = temps2d[y0][x1];
      const t01 = temps2d[y1][x0];
      const t11 = temps2d[y1][x1];

      const top = t00 + (t10 - t00) * fx;
      const bottom = t01 + (t11 - t01) * fx;
      const temp = top + (bottom - top) * fy;

      const [r, g, b] = parseHslColor(colorFromTemperature(temp, minTemp, maxTemp));
      const idx = (py * width + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 150;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return L.imageOverlay(
    canvas.toDataURL("image/png"),
    [[bounds.south, bounds.west], [bounds.north, bounds.east]],
    { opacity: 0.95, interactive: false }
  );
}

export default function ClimateMap({
  area,
  height = 280,
  mode = "parcel",
}: {
  area: ClimateArea;
  height?: number;
  mode?: "parcel" | "czech";
}) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ min: number; max: number; avg: number; time: string } | null>(null);

  const fallbackBounds = mode === "czech" ? CZECH_BOUNDS : area.bounds;
  const boundsKey = useMemo(() => (
    `${mode}:${fallbackBounds.north.toFixed(5)}:${fallbackBounds.south.toFixed(5)}:${fallbackBounds.east.toFixed(5)}:${fallbackBounds.west.toFixed(5)}`
  ), [mode, fallbackBounds.north, fallbackBounds.south, fallbackBounds.east, fallbackBounds.west]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        const L = await loadLeaflet();
        if (cancelled || !mapHostRef.current) return;

        if (!mapRef.current) {
          mapRef.current = L.map(mapHostRef.current, {
            zoomControl: false,
            attributionControl: true,
            preferCanvas: true,
          });
          mapRef.current.createPane("climatePane").style.zIndex = "350";
          mapRef.current.createPane("maskPane").style.zIndex = "500";
          L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
          L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
            subdomains: "abcd",
            maxZoom: 19,
            attribution: "OpenStreetMap, CARTO, Open-Meteo",
          }).addTo(mapRef.current);
        }

        const map = mapRef.current;
        layersRef.current.forEach((layer) => map.removeLayer(layer));
        layersRef.current = [];

        let climateBounds = fallbackBounds;
        let czLayer: any = null;
        let czFeature: any = null;
        if (mode === "czech") {
          czFeature = await loadCzechFeature();
          if (czFeature) {
            czLayer = L.geoJSON(czFeature, {
              style: { color: "#2e3a1f", weight: 2, fill: false, opacity: 0.9 },
              interactive: false,
            }).addTo(map);
            layersRef.current.push(czLayer);
            climateBounds = geoBoundsToClimateBounds(czLayer.getBounds());
          }
        }

        const gridSize = mode === "czech" ? CZECH_GRID_SIZE : PARCEL_GRID_SIZE;
        const expandRatio = mode === "czech" ? 0 : 0.3;
        const samples = await fetchClimateSamples(climateBounds, gridSize, expandRatio);
        if (cancelled) return;

        const temps = samples.map((s) => s.temperature);
        const min = Math.min(...temps);
        const max = Math.max(...temps);
        const avg = temps.reduce((sum, value) => sum + value, 0) / temps.length;
        const time = samples[0]?.time ?? "";
        setStats({ min, max, avg, time });

        const smoothOverlay = buildContinuousOverlay(L, samples, climateBounds, gridSize, min, max);
        if (smoothOverlay) {
          smoothOverlay.options.pane = "climatePane";
          smoothOverlay.addTo(map);
          layersRef.current.push(smoothOverlay);
        }

        if (mode === "czech" && czFeature) {
          const czRings = featureToLatLngRings(czFeature);
          if (czRings.length > 0) {
            const worldRing: [number, number][] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
            const outsideMask = L.polygon([worldRing, ...czRings], {
              color: "transparent",
              fillColor: "#e8ebd8",
              fillOpacity: 1,
              fillRule: "evenodd",
              interactive: false,
              pane: "maskPane",
            }).addTo(map);
            layersRef.current.push(outsideMask);
          }
        }

        if (mode === "czech") {
          const parcelHalo = L.polygon(area.points, {
            color: "#f4f5e0",
            weight: 7,
            opacity: 0.9,
            fillColor: "#2e3a1f",
            fillOpacity: 0.18,
            interactive: false,
          }).addTo(map);
          layersRef.current.push(parcelHalo);
        }

        const parcel = L.polygon(area.points, {
          color: "#1f2a12",
          weight: mode === "czech" ? 3.5 : 2.5,
          opacity: 1,
          fillColor: mode === "czech" ? "#d8e6be" : "#2e3a1f22",
          fillOpacity: mode === "czech" ? 0.38 : 0.24,
          interactive: false,
        }).addTo(map);
        layersRef.current.push(parcel);

        if (mode === "czech" && czLayer) {
          const czBounds = czLayer.getBounds();
          map.setMaxBounds(czBounds.pad(0.08));
          map.fitBounds(czBounds, { padding: [0, 0], maxZoom: 8 });
          const fitZoom = map.getZoom();
          map.setMinZoom(Math.max(4, fitZoom - 2));
          map.setMaxZoom(Math.min(18, fitZoom + 5));
          map.scrollWheelZoom.enable();
          map.doubleClickZoom.enable();
          map.touchZoom.enable();
          map.boxZoom.enable();
          map.keyboard.enable();
          if (map.tap) map.tap.enable();
        } else if (mode === "czech") {
          map.setMaxBounds([[CZECH_BOUNDS.south, CZECH_BOUNDS.west], [CZECH_BOUNDS.north, CZECH_BOUNDS.east]]);
          map.fitBounds([[CZECH_BOUNDS.south, CZECH_BOUNDS.west], [CZECH_BOUNDS.north, CZECH_BOUNDS.east]], { padding: [0, 0], maxZoom: 8 });
          const fitZoom = map.getZoom();
          map.setMinZoom(Math.max(4, fitZoom - 2));
          map.setMaxZoom(Math.min(18, fitZoom + 5));
          map.scrollWheelZoom.enable();
          map.doubleClickZoom.enable();
          map.touchZoom.enable();
          map.boxZoom.enable();
          map.keyboard.enable();
          if (map.tap) map.tap.enable();
        } else {
          map.setMaxBounds(null);
          map.setMinZoom(1);
          map.setMaxZoom(19);
          map.scrollWheelZoom.enable();
          map.doubleClickZoom.enable();
          map.touchZoom.enable();
          map.boxZoom.enable();
          map.keyboard.enable();
          if (map.tap) map.tap.enable();
          map.fitBounds(parcel.getBounds().pad(0.6), { padding: [16, 16], maxZoom: 14 });
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError("Nepodařilo se načíst klimatická data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [area.points, fallbackBounds, boundsKey, mode]);

  useEffect(() => {
    return () => {
      if (!mapRef.current) return;
      mapRef.current.remove();
      mapRef.current = null;
      layersRef.current = [];
    };
  }, []);

  return (
    <div>
      <div
        style={{
          height,
          border: "1.5px solid #2e3a1f22",
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
          background: "#e8ebd8",
        }}
      >
        <div ref={mapHostRef} style={{ width: "100%", height: "100%" }} />
        {loading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#F4F5E0cc", color: "#2e3a1f88", fontSize: 12, letterSpacing: "0.04em",
          }}>
            Načítám klimatická data…
          </div>
        )}
        {error && !loading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#F4F5E0e0", color: "#7a3b3b", fontSize: 12, letterSpacing: "0.04em", textAlign: "center", padding: 12,
          }}>
            {error}
          </div>
        )}
      </div>
      {stats && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 14 }}>
          <div style={{ fontSize: 11, color: "#2e3a1f77" }}>Min: <span style={{ color: "#2e3a1f", fontStyle: "italic" }}>{stats.min.toFixed(1)} °C</span></div>
          <div style={{ fontSize: 11, color: "#2e3a1f77" }}>Průměr: <span style={{ color: "#2e3a1f", fontStyle: "italic" }}>{stats.avg.toFixed(1)} °C</span></div>
          <div style={{ fontSize: 11, color: "#2e3a1f77" }}>Max: <span style={{ color: "#2e3a1f", fontStyle: "italic" }}>{stats.max.toFixed(1)} °C</span></div>
          {stats.time && <div style={{ fontSize: 11, color: "#2e3a1f66" }}>Aktualizace: {stats.time.replace("T", " ")}</div>}
        </div>
      )}
    </div>
  );
}
