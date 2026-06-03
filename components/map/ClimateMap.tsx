"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadLeaflet } from "@/lib/leaflet";
import { loadCzFeature } from "@/lib/czBorder";

interface ClimateArea {
  points: [number, number][];
  bounds: { north: number; south: number; east: number; west: number };
}

interface ClimateSample {
  lat: number;
  lng: number;
  temperature: number;
  elevation: number;
  time: string;
}

const PARCEL_GRID_SIZE = 5;
const CZECH_GRID_SIZE = 14;
const climateCache = new Map<string, Promise<ClimateSample[]>>();
const CZECH_BOUNDS = {
  north: 51.10,
  south: 48.50,
  east: 18.95,
  west: 12.05,
};

interface CityThermalOverlay {
  labelCz: string;
  source: string;
  bounds: { north: number; south: number; east: number; west: number };
  serviceUrl: string;
}

const CITY_THERMAL_OVERLAYS: CityThermalOverlay[] = [
  {
    labelCz: "Teplotní mapa Brna 2024",
    source: "gis.brno.cz · CzechGlobe",
    bounds: { north: 49.34, south: 49.10, east: 16.77, west: 16.44 },
    serviceUrl: "https://gis.brno.cz/ags2/rest/services/PUBLIC/TM_teplotni_mapa_2024/MapServer",
  },
];

function areaIntersectsCity(
  area: { north: number; south: number; east: number; west: number },
  city: CityThermalOverlay["bounds"],
  padding = 0.04
): boolean {
  return (
    area.north > city.south - padding &&
    area.south < city.north + padding &&
    area.east > city.west - padding &&
    area.west < city.east + padding
  );
}

function buildArcGISExportUrl(serviceUrl: string, b: CityThermalOverlay["bounds"]): string {
  const w = 2048;
  const h = Math.round(w * (b.north - b.south) / (b.east - b.west));
  const url = new URL(`${serviceUrl}/export`);
  url.searchParams.set("bbox", `${b.west},${b.south},${b.east},${b.north}`);
  url.searchParams.set("bboxSR", "4326");
  url.searchParams.set("imageSR", "4326");
  url.searchParams.set("size", `${w},${Math.min(h, 2048)}`);
  url.searchParams.set("format", "png32");
  url.searchParams.set("transparent", "true");
  url.searchParams.set("f", "image");
  return url.toString();
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
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${gridSize}:${expandRatio}:${bounds.north.toFixed(4)}:${bounds.south.toFixed(4)}:${bounds.east.toFixed(4)}:${bounds.west.toFixed(4)}`;
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
      endpoint.searchParams.set("hourly", "temperature_2m");
      endpoint.searchParams.set("start_date", today);
      endpoint.searchParams.set("end_date", today);
      endpoint.searchParams.set("timezone", "Europe/Prague");

      const json = await fetchWithRetry(endpoint.toString(), 4);
      const parsed = parseBatchResponse(json, chunk);
      samples.push(...parsed);
    }

    return samples;
  })();

  climateCache.set(key, request);
  request.catch(() => climateCache.delete(key));
  return request;
}

async function fetchWithRetry(url: string, maxRetries: number): Promise<any> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        lastErr = new Error(`Open-Meteo rate limited (attempt ${attempt + 1}/${maxRetries + 1})`);
        const waitMs = Math.min(8000, 600 * 2 ** attempt) + Math.floor(Math.random() * 400);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      if (!res.ok) throw new Error(`Open-Meteo responded with ${res.status}`);
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
  const elevations: number[] = [];
  let time = "";

  rows.forEach((row: any) => {
    const rowElev = typeof row?.elevation === "number" ? row.elevation : 0;

    if (row?.hourly?.time && Array.isArray(row.hourly.temperature_2m)) {
      const times: string[] = row.hourly.time;
      const temps2m: number[] = row.hourly.temperature_2m;
      const noonIdx = times.findIndex((t: string) => t.endsWith("T12:00"));
      const idx = noonIdx >= 0 ? noonIdx : Math.min(12, temps2m.length - 1);
      if (typeof temps2m[idx] === "number") {
        temps.push(temps2m[idx]);
        elevations.push(rowElev);
        if (!time && times[idx]) time = times[idx];
      }
      return;
    }
    if (Array.isArray(row?.current)) {
      const before = temps.length;
      row.current.forEach((entry: any) => {
        if (typeof entry?.temperature_2m === "number") temps.push(entry.temperature_2m);
        if (!time && entry?.time) time = String(entry.time);
      });
      for (let i = temps.length - before; i > 0; i--) elevations.push(rowElev);
      return;
    }
    if (Array.isArray(row?.current?.temperature_2m)) {
      const before = temps.length;
      row.current.temperature_2m.forEach((t: any) => {
        if (typeof t === "number") temps.push(t);
      });
      if (!time && row?.current?.time) {
        if (Array.isArray(row.current.time)) time = String(row.current.time[0] ?? "");
        else time = String(row.current.time);
      }
      for (let i = temps.length - before; i > 0; i--) elevations.push(rowElev);
      return;
    }
    if (typeof row?.current?.temperature_2m === "number") {
      temps.push(row.current.temperature_2m);
      elevations.push(rowElev);
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
      elevation: elevations[0] ?? 0,
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
    elevation: elevations[i] ?? 0,
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

function buildCanvasTileLayer(
  L: any,
  samples: ClimateSample[],
  bounds: ClimateArea["bounds"],
  gridSize: number,
  minTemp: number,
  maxTemp: number
) {
  const LAPSE_RATE = 6.5 / 1000;
  const expected = gridSize * gridSize;
  if (samples.length !== expected) return null;

  const seaLevelTemps2d: number[][] = [];
  const elevations2d: number[][] = [];
  for (let y = 0; y < gridSize; y++) {
    const row = samples.slice(y * gridSize, (y + 1) * gridSize);
    seaLevelTemps2d.push(row.map((s) => s.temperature + s.elevation * LAPSE_RATE));
    elevations2d.push(row.map((s) => s.elevation));
  }

  const ClimateTileLayer = L.GridLayer.extend({
    createTile(coords: any, done: (err: any, tile: HTMLCanvasElement) => void) {
      const tile = document.createElement("canvas");
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext("2d");
      if (!ctx) { done(null, tile); return tile; }

      const tileBounds = this._tileCoordsToBounds(coords);
      const tileNorth = tileBounds.getNorth();
      const tileSouth = tileBounds.getSouth();
      const tileWest = tileBounds.getWest();
      const tileEast = tileBounds.getEast();

      const imageData = ctx.createImageData(size.x, size.y);
      const data = imageData.data;

      for (let py = 0; py < size.y; py++) {
        const lat = tileNorth + (tileSouth - tileNorth) * (py / (size.y - 1));
        const gy = ((lat - bounds.south) / (bounds.north - bounds.south)) * (gridSize - 1);

        for (let px = 0; px < size.x; px++) {
          const lng = tileWest + (tileEast - tileWest) * (px / (size.x - 1));
          const gx = ((lng - bounds.west) / (bounds.east - bounds.west)) * (gridSize - 1);
          const idx = (py * size.x + px) * 4;

          if (gy < 0 || gy > gridSize - 1 || gx < 0 || gx > gridSize - 1) {
            data[idx + 3] = 0;
            continue;
          }

          const y0 = Math.min(Math.floor(gy), gridSize - 2);
          const y1 = y0 + 1;
          const fy = gy - y0;
          const x0 = Math.min(Math.floor(gx), gridSize - 2);
          const x1 = x0 + 1;
          const fx = gx - x0;

          const sl00 = seaLevelTemps2d[y0][x0], sl10 = seaLevelTemps2d[y0][x1];
          const sl01 = seaLevelTemps2d[y1][x0], sl11 = seaLevelTemps2d[y1][x1];
          const seaLevelTemp = sl00 + (sl10 - sl00) * fx + (sl01 - sl00) * fy + (sl11 - sl10 - sl01 + sl00) * fx * fy;

          const e00 = elevations2d[y0][x0], e10 = elevations2d[y0][x1];
          const e01 = elevations2d[y1][x0], e11 = elevations2d[y1][x1];
          const elev = e00 + (e10 - e00) * fx + (e01 - e00) * fy + (e11 - e10 - e01 + e00) * fx * fy;

          const temp = seaLevelTemp - elev * LAPSE_RATE;
          const [r, g, b] = parseHslColor(colorFromTemperature(temp, minTemp, maxTemp));
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 150;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setTimeout(() => done(null, tile), 0);
      return tile;
    },
  });

  return new ClimateTileLayer({ opacity: 0.95, interactive: false });
}

export async function addClimateLayersToMap(
  L: any,
  map: any,
  pane = "overlayPane",
): Promise<any[]> {
  const layers: any[] = [];

  const samples = await fetchClimateSamples(CZECH_BOUNDS, CZECH_GRID_SIZE, 0);
  const temps = samples.map(s => s.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);

  const smoothOverlay = buildCanvasTileLayer(L, samples, CZECH_BOUNDS, CZECH_GRID_SIZE, min, max);
  if (smoothOverlay) {
    smoothOverlay.options.pane = pane;
    smoothOverlay.addTo(map);
    layers.push(smoothOverlay);
  }

  for (const city of CITY_THERMAL_OVERLAYS) {
    const { north, south, east, west } = city.bounds;
    const imgUrl = buildArcGISExportUrl(city.serviceUrl, city.bounds);
    const cityLayer = L.imageOverlay(imgUrl, [[south, west], [north, east]], {
      opacity: 0.85, interactive: false, pane,
    }).addTo(map);
    layers.push(cityLayer);
  }

  return layers;
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
  const [citySource, setCitySource] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

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
        setCitySource(null);
        const L = await loadLeaflet();
        if (cancelled || !mapHostRef.current) return;

        if (!mapRef.current) {
          mapRef.current = L.map(mapHostRef.current, {
            zoomControl: false,
            attributionControl: true,
            preferCanvas: true,
          });
          mapRef.current.createPane("climatePane").style.zIndex = "350";
          mapRef.current.createPane("cityPane").style.zIndex = "375";
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

        {
          const earlyParcel = L.polygon(area.points);
          map.fitBounds(earlyParcel.getBounds().pad(0.6), { padding: [16, 16], maxZoom: 14 });
        }

        let climateBounds = fallbackBounds;
        let czLayer: any = null;
        let czFeature: any = null;
        if (mode === "czech") {
          czFeature = await loadCzFeature();
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

        const smoothOverlay = buildCanvasTileLayer(L, samples, climateBounds, gridSize, min, max);
        if (smoothOverlay) {
          smoothOverlay.options.pane = "climatePane";
          smoothOverlay.addTo(map);
          layersRef.current.push(smoothOverlay);
        }

        for (const city of CITY_THERMAL_OVERLAYS) {
          if (areaIntersectsCity(area.bounds, city.bounds)) {
            const { north, south, east, west } = city.bounds;
            const imgUrl = buildArcGISExportUrl(city.serviceUrl, city.bounds);
            const cityLayer = L.imageOverlay(imgUrl, [[south, west], [north, east]], {
              opacity: 0.82,
              interactive: false,
              pane: "cityPane",
            }).addTo(map);
            layersRef.current.push(cityLayer);
            setCitySource(`${city.labelCz} — ${city.source}`);
            break;
          }
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

        if (mode === "czech") {
          const czBounds = czLayer
            ? czLayer.getBounds()
            : L.latLngBounds([[CZECH_BOUNDS.south, CZECH_BOUNDS.west], [CZECH_BOUNDS.north, CZECH_BOUNDS.east]]);
          map.setMaxBounds(czBounds.pad(0.08));
          map.setMinZoom(4);
          map.setMaxZoom(18);
          map.scrollWheelZoom.enable();
          map.doubleClickZoom.enable();
          map.touchZoom.enable();
          map.boxZoom.enable();
          map.keyboard.enable();
          if (map.tap) map.tap.enable();
          map.fitBounds(parcel.getBounds().pad(0.6), { padding: [16, 16], maxZoom: 14 });
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
  }, [area.points, fallbackBounds, boundsKey, mode, retryCount]);

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
            position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
            background: "#F4F5E0e0", color: "#7a3b3b", fontSize: 12, letterSpacing: "0.04em", textAlign: "center", padding: 12,
          }}>
            <span>{error}</span>
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              style={{ fontSize: 11, letterSpacing: "0.06em", color: "#2e3a1f", background: "none", border: "1px solid #2e3a1f66", borderRadius: 3, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}
            >
              Zkusit znovu
            </button>
          </div>
        )}
      </div>
      {stats && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 14 }}>
          <div style={{ fontSize: 11, color: "#2e3a1f77" }}>Min: <span style={{ color: "#2e3a1f", fontStyle: "italic" }}>{stats.min.toFixed(1)} °C</span></div>
          <div style={{ fontSize: 11, color: "#2e3a1f77" }}>Průměr: <span style={{ color: "#2e3a1f", fontStyle: "italic" }}>{stats.avg.toFixed(1)} °C</span></div>
          <div style={{ fontSize: 11, color: "#2e3a1f77" }}>Max: <span style={{ color: "#2e3a1f", fontStyle: "italic" }}>{stats.max.toFixed(1)} °C</span></div>
          {stats.time && <div style={{ fontSize: 11, color: "#2e3a1f66" }}>Aktualizace: {stats.time.replace("T", " ")}</div>}
          {citySource && <div style={{ fontSize: 11, color: "#2e3a1f66", width: "100%" }}>Detailní vrstva: {citySource}</div>}
        </div>
      )}
    </div>
  );
}
