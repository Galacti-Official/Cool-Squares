"use client";

import { useEffect, useRef, useState } from "react";

interface SelectedArea {
  points: [number, number][];
  bounds: { north: number; south: number; east: number; west: number };
  areaSqKm: number;
}

interface SatelliteTile {
  z: number;
  x: number;
  y: number;
  img: HTMLImageElement;
}

function lngToTileX(lng: number, z: number): number {
  const n = 2 ** z;
  return Math.floor(((lng + 180) / 360) * n);
}

function latToTileY(lat: number, z: number): number {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
}

function tileXToLng(x: number, z: number): number {
  return (x / (2 ** z)) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function makeProjection(
  points: [number, number][],
  canvasW: number,
  canvasH: number,
  pad = 60
): {
  project: (pt: [number, number]) => [number, number];
  unproject: (pt: [number, number]) => [number, number];
  pixelsPerMetre: number;
} {
  const lats = points.map(p => p[0]);
  const lngs = points.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;

  const R = 6371000;
  const bboxWMetres = ((maxLng - minLng) * Math.PI / 180) * R * Math.cos(midLat * Math.PI / 180);

  
  const drawW = canvasW - pad * 2;
  const drawH = canvasH - pad * 2;

  const bboxW = maxLng - minLng || 0.0001;
  const bboxH = maxLat - minLat || 0.0001;
  const scaleX = drawW / bboxW;
  const scaleY = drawH / bboxH;
  const scaleDeg = Math.min(scaleX, scaleY);

  const pixelsPerMetre = bboxWMetres > 0
    ? (bboxW * scaleDeg) / bboxWMetres
    : 1;


  const fittedW = bboxW * scaleDeg;
  const fittedH = bboxH * scaleDeg;
  const offsetX = pad + (drawW - fittedW) / 2;
  const offsetY = pad + (drawH - fittedH) / 2;

  const project = ([lat, lng]: [number, number]): [number, number] => [
    offsetX + (lng - minLng) * scaleDeg,
    offsetY + (maxLat - lat) * scaleDeg,
  ];

  const unproject = ([x, y]: [number, number]): [number, number] => [
    maxLat - (y - offsetY) / scaleDeg,
    minLng + (x - offsetX) / scaleDeg,
  ];

  return { project, unproject, pixelsPerMetre };
}

const ELEMENT_CATALOG = [
  {
    category: "Nádoby",
    items: [
      { type: "pot_small",    label: "Malý květináč",  icon: "🪴", w: 0.30, h: 0.30, shape: "circle",  color: "#8B6F47", desc: "ø 30 cm" },
      { type: "pot_large",    label: "Velký květináč", icon: "🏺", w: 0.50, h: 0.50, shape: "circle",  color: "#7A5C3A", desc: "ø 50 cm" },
      { type: "planter_box",  label: "Truhlík",        icon: "▭",  w: 1.20, h: 0.50, shape: "rect",    color: "#6B4F2E", desc: "120×50 cm" },
      { type: "window_box",   label: "Okenní truhlík", icon: "▭",  w: 0.80, h: 0.25, shape: "rect",    color: "#8B6F47", desc: "80×25 cm" },
      { type: "hanging",      label: "Závěsný koš",    icon: "⊕",  w: 0.30, h: 0.30, shape: "circle",  color: "#9E7B56", desc: "ø 30 cm" },
    ],
  },
  {
    category: "Pěstební záhony",
    items: [
      { type: "bed_small",    label: "Vyvýšený záhon S", icon: "▬",  w: 1.20, h: 0.80, shape: "rect",    color: "#4A7C59", desc: "120×80 cm" },
      { type: "bed_medium",   label: "Vyvýšený záhon M", icon: "▬",  w: 2.00, h: 1.00, shape: "rect",    color: "#3D6B4A", desc: "200×100 cm" },
      { type: "bed_large",    label: "Vyvýšený záhon L", icon: "▬",  w: 3.00, h: 1.20, shape: "rect",    color: "#336040", desc: "300×120 cm" },
      { type: "bed_round",    label: "Kulatý záhon",     icon: "◯",  w: 1.20, h: 1.20, shape: "circle",  color: "#4A7C59", desc: "ø 120 cm" },
      { type: "keyhole",      label: "Záhon keyhole",    icon: "◌",  w: 1.80, h: 1.80, shape: "keyhole", color: "#5A8C6A", desc: "ø 180 cm" },
    ],
  },
  {
    category: "Konstrukce",
    items: [
      { type: "trellis",      label: "Mříž",             icon: "⊞",  w: 2.00, h: 0.20, shape: "rect",    color: "#8B7355", desc: "200×20 cm" },
      { type: "arch",         label: "Zahradní oblouk",  icon: "⌢",  w: 0.80, h: 0.30, shape: "arch",    color: "#7A6445", desc: "80×30 cm" },
      { type: "coldframe",    label: "Pařeniště",        icon: "▦",  w: 1.20, h: 0.80, shape: "rect",    color: "#6B8C9E", desc: "120×80 cm" },
      { type: "greenhouse",   label: "Mini skleník",     icon: "🏠", w: 2.00, h: 1.50, shape: "rect",    color: "#82A8BC", desc: "200×150 cm" },
      { type: "compost",      label: "Kompostér",        icon: "♻",  w: 0.80, h: 0.80, shape: "rect",    color: "#7A6840", desc: "80×80 cm" },
    ],
  },
  {
    category: "Voda",
    items: [
      { type: "water_barrel", label: "Sud na vodu",    icon: "⬤",  w: 0.60, h: 0.60, shape: "circle",  color: "#5B7FA0", desc: "200 L" },
      { type: "water_tank",   label: "IBC nádrž",      icon: "▣",  w: 1.00, h: 1.20, shape: "rect",    color: "#4A6E8F", desc: "1000 L" },
      { type: "pond",         label: "Mini jezírko",   icon: "◯",  w: 1.50, h: 1.00, shape: "ellipse", color: "#3D6B8A", desc: "150×100 cm" },
      { type: "tap",          label: "Vodovodní bod",  icon: "⊕",  w: 0.10, h: 0.10, shape: "circle",  color: "#5B7FA0", desc: "kohoutek" },
    ],
  },
  {
    category: "Cesty",
    items: [
      { type: "path_h",       label: "Cesta (V)",      icon: "—",  w: 2.00, h: 0.60, shape: "rect",    color: "#C4B89A", desc: "200×60 cm" },
      { type: "path_v",       label: "Cesta (S)",      icon: "|",  w: 0.60, h: 2.00, shape: "rect",    color: "#C4B89A", desc: "60×200 cm" },
      { type: "seating",      label: "Posezení",       icon: "◻",  w: 3.00, h: 3.00, shape: "rect",    color: "#B8A882", desc: "300×300 cm" },
    ],
  },
];

const SNAP = 5; 
const HIT_PADDING_PX = 12;
function snapTo(v: number) { return Math.round(v / SNAP) * SNAP; }
function genId() { return Math.random().toString(36).slice(2, 9); }

interface PlacedElement {
  id: string;
  type: string;
  x: number;     
  y: number;    
  wPx: number;   
  hPx: number;   
  rotation: number;
  note?: string;
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function rectWithinPolygon(
  x: number,
  y: number,
  w: number,
  h: number,
  polygon: [number, number][]
): boolean {
  const corners: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  return corners.every((corner) => pointInPolygon(corner, polygon));
}


function drawShape(
  ctx: CanvasRenderingContext2D,
  item: any,
  x: number, y: number, w: number, h: number,
  selected: boolean, hovered: boolean
) {
  const { shape, color } = item;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
  const hw = w / 2, hh = h / 2;

  if (selected || hovered) {
    ctx.shadowColor = selected ? "#2e3a1f88" : "#2e3a1f33";
    ctx.shadowBlur = selected ? 12 : 6;
  }

  ctx.fillStyle = color + (selected ? "ee" : "bb");
  ctx.strokeStyle = selected ? "#2e3a1f" : "#2e3a1f66";
  ctx.lineWidth = selected ? 2 : 1;

  if (shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color + "44";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.65, hh * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  } else if (shape === "rect") {
    ctx.beginPath();
    (ctx as any).roundRect(-hw, -hh, w, h, 3);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color + "44";
    ctx.lineWidth = 1;
    const step = Math.max(15, Math.min(hw, hh) * 0.4);
    for (let ox = -hw + step; ox < hw; ox += step) {
      ctx.beginPath(); ctx.moveTo(ox, -hh + 4); ctx.lineTo(ox, hh - 4); ctx.stroke();
    }
  } else if (shape === "arch") {
    ctx.beginPath();
    (ctx as any).roundRect(-hw, -hh, w, h, 6);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color + "55";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, hh, hw * 0.7, Math.PI, 0);
    ctx.stroke();
  } else if (shape === "keyhole") {
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color + "44";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * 0.5, hh * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -hh * 0.5); ctx.lineTo(0, -hh);
    ctx.stroke();
  } else {
    ctx.fillRect(-hw, -hh, w, h);
    ctx.strokeRect(-hw, -hh, w, h);
  }

  const showInlineLabel = !selected && !hovered;
  if (showInlineLabel) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#2e3a1fcc";
    ctx.font = `${Math.max(9, Math.min(11, w / 10))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = item.label.length > 12 ? item.label.slice(0, 11) + "…" : item.label;
    ctx.fillText(label, 0, 0);
  }

  if (selected) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#2e3a1f";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    if (shape === "circle" || shape === "ellipse" || shape === "keyhole") {
      ctx.beginPath();
      ctx.ellipse(0, 0, hw + 5, hh + 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(-hw - 5, -hh - 5, w + 10, h + 10);
    }

    // Corner ticks for stronger selected-state readability while dragging.
    const tick = 5;
    const ox = hw + 7;
    const oy = hh + 7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-ox, -oy + tick); ctx.lineTo(-ox, -oy); ctx.lineTo(-ox + tick, -oy);
    ctx.moveTo(ox - tick, -oy); ctx.lineTo(ox, -oy); ctx.lineTo(ox, -oy + tick);
    ctx.moveTo(-ox, oy - tick); ctx.lineTo(-ox, oy); ctx.lineTo(-ox + tick, oy);
    ctx.moveTo(ox - tick, oy); ctx.lineTo(ox, oy); ctx.lineTo(ox, oy - tick);
    ctx.stroke();
  }

  ctx.restore();
}

function CatalogItem({ item, onDragStart }: { item: any; onDragStart: (e: React.DragEvent, item: any) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      title={item.desc}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 4, padding: "10px 6px", cursor: "grab",
        border: "1.5px solid transparent", borderRadius: 4,
        transition: "all 0.12s", userSelect: "none",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "#2e3a1f33";
        (e.currentTarget as HTMLElement).style.background = "#2e3a1f08";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "transparent";
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 4,
        background: item.color + "33",
        border: `1.5px solid ${item.color}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>
        {item.icon}
      </div>
      <span style={{
        fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase",
        color: "#2e3a1f88", textAlign: "center", lineHeight: 1.2, maxWidth: 52,
        fontFamily: "inherit",
      }}>{item.label}</span>
    </div>
  );
}

function PropertiesPanel({
  item,
  selectedCount,
  onChange,
  onDelete,
}: {
  item: PlacedElement | null;
  selectedCount: number;
  onChange: (item: PlacedElement) => void;
  onDelete: () => void;
}) {
  if (!item) return (
    <div style={{ padding: "20px 16px", color: "#2e3a1f55", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
      {selectedCount > 1
        ? "Vybráno více prvků"
        : "Vyberte prvek pro úpravu jeho vlastností"}
    </div>
  );

  const catalogItem = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === item.type);

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88", marginBottom: 12 }}>
        Vlastnosti
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: "#2e3a1f", fontStyle: "italic", marginBottom: 2 }}>{catalogItem?.label}</div>
        <div style={{ fontSize: 11, color: "#2e3a1f55" }}>{catalogItem?.desc}</div>
        <div style={{ fontSize: 10, color: "#2e3a1f44", marginTop: 4 }}>
          {item.wPx}×{item.hPx} px na plátně
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f77", marginBottom: 4 }}>
          Rotace (°)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range" min={0} max={360} value={item.rotation || 0}
            onChange={e => onChange({ ...item, rotation: Number(e.target.value) })}
            style={{ flex: 1, accentColor: "#2e3a1f" }}
          />
          <span style={{ fontSize: 11, color: "#2e3a1f", width: 32, textAlign: "right" }}>
            {item.rotation || 0}°
          </span>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f77", marginBottom: 4 }}>
          Poznámka
        </div>
        <textarea
          value={item.note || ""}
          onChange={e => onChange({ ...item, note: e.target.value })}
          placeholder="Přidat poznámku…"
          rows={2}
          style={{
            width: "100%", resize: "none", background: "#2e3a1f08",
            border: "1.5px solid #2e3a1f22", borderRadius: 3,
            padding: "6px 8px", fontSize: 12, fontFamily: "inherit",
            color: "#2e3a1f", outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
      <button
        onClick={onDelete}
        style={{
          width: "100%", padding: "8px", background: "none",
          border: "1.5px solid #cc444422", borderRadius: 3,
          color: "#cc4444", fontSize: 12, cursor: "pointer",
          fontFamily: "inherit", letterSpacing: "0.04em",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#cc444411"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
      >
        Odebrat prvek
      </button>
    </div>
  );
}

interface Viewport {
  x: number;    
  y: number;    
  zoom: number;
  angle: number;
}

export default function ParcelEditor({ area, onBack }: { area: SelectedArea; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<PlacedElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editorMapStyle, setEditorMapStyle] = useState<"map" | "satellite">("map");
  const [zoomDisplay, setZoomDisplay] = useState(100);
  const [satTilesVersion, setSatTilesVersion] = useState(0);
  const [satImageStatus, setSatImageStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const elementsRef = useRef(elements);
  const selectedIdsRef = useRef(selectedIds);
  const hoveredIdRef = useRef(hoveredId);
  const canvasSize = useRef({ w: 800, h: 600 });
  const pixelsPerMetreRef = useRef(1);
  const draggingCatalogItem = useRef<any>(null);
  const satelliteTilesRef = useRef<SatelliteTile[]>([]);
  const rotateHandleRef = useRef<{ id: string; x: number; y: number; radius: number } | null>(null);
  const rotateDragRef = useRef<{ id: string; angleOffsetDeg: number } | null>(null);

  const vp = useRef<Viewport>({ x: 0, y: 0, zoom: 1, angle: 0 });
  const vpInitialised = useRef(false);

  const panState = useRef<{ startX: number; startY: number; startVpX: number; startVpY: number } | null>(null);
  const dragState = useRef<{
    ids: string[];
    startWorldX: number;
    startWorldY: number;
    startPositions: Record<string, { x: number; y: number }>;
  } | null>(null);
  const marqueeState = useRef<{ startX: number; startY: number; additive: boolean } | null>(null);
  const spaceDown = useRef(false);

  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);

  useEffect(() => {
    if (editorMapStyle !== "satellite") {
      setSatImageStatus("idle");
      return;
    }
    setSatImageStatus("loading");
    satelliteTilesRef.current = [];
    setSatTilesVersion((v) => v + 1);

    const { north, south, east, west } = area.bounds;
    const maxTiles = 36;
    let zoom = 18;
    for (let z = 18; z >= 12; z--) {
      const xMin = lngToTileX(west, z);
      const xMax = lngToTileX(east, z);
      const yMin = latToTileY(north, z);
      const yMax = latToTileY(south, z);
      const count = (Math.abs(xMax - xMin) + 1) * (Math.abs(yMax - yMin) + 1);
      if (count <= maxTiles) {
        zoom = z;
        break;
      }
    }

    const x0 = Math.min(lngToTileX(west, zoom), lngToTileX(east, zoom));
    const x1 = Math.max(lngToTileX(west, zoom), lngToTileX(east, zoom));
    const y0 = Math.min(latToTileY(north, zoom), latToTileY(south, zoom));
    const y1 = Math.max(latToTileY(north, zoom), latToTileY(south, zoom));

    let cancelled = false;
    const loads: Promise<SatelliteTile | null>[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        loads.push(new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ z: zoom, x, y, img });
          img.onerror = () => resolve(null);
          img.src = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
        }));
      }
    }

    Promise.all(loads).then((tiles) => {
      if (cancelled) return;
      const loaded = tiles.filter((t): t is SatelliteTile => t !== null);
      satelliteTilesRef.current = loaded;
      setSatImageStatus(loaded.length > 0 ? "ready" : "error");
      setSatTilesVersion((v) => v + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [editorMapStyle, area.bounds.north, area.bounds.south, area.bounds.east, area.bounds.west]);

  function screenToWorld(sx: number, sy: number): [number, number] {
    const { x, y, zoom, angle } = vp.current;
    const dx = sx - x, dy = sy - y;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    return [
      (dx * cos - dy * sin) / zoom,
      (dx * sin + dy * cos) / zoom,
    ];
  }

  function worldToScreen(wx: number, wy: number): [number, number] {
    const { x, y, zoom, angle } = vp.current;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [
      wx * zoom * cos - wy * zoom * sin + x,
      wx * zoom * sin + wy * zoom * cos + y,
    ];
  }

  function fitParcel() {
    const { w, h } = canvasSize.current;
    const { project, pixelsPerMetre } = makeProjection(area.points, w, h, 80);
    const pts = area.points.map(project);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pw = maxX - minX, ph = maxY - minY;
    const zoom = Math.min((w - 120) / pw, (h - 120) / ph, 4);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    vp.current = {
      x: w / 2 - cx * zoom,
      y: h / 2 - cy * zoom,
      zoom,
      angle: 0,
    };
    pixelsPerMetreRef.current = pixelsPerMetre;
    setZoomDisplay(Math.round(zoom * 100));
  }

  useEffect(() => {
    if (!vpInitialised.current && canvasSize.current.w > 100) {
      fitParcel();
      vpInitialised.current = true;
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;

    function render() {
      const { w, h } = canvasSize.current;
      const { x: vpX, y: vpY, zoom, angle } = vp.current;
      const isSatellite = editorMapStyle === "satellite";
      const hasSatelliteTiles = isSatellite && satelliteTilesRef.current.length > 0;
      const bgFill = isSatellite ? "#5d6757" : "#d6d7c3";
      const bgGrid = isSatellite ? "#ffffff14" : "#c8c9b544";
      const outsideFill = isSatellite ? "#3f463bcc" : "#d6d7c3cc";
      const parcelFill = isSatellite ? "#6f7d68" : "#F4F5E0";
      const parcelFineGrid = isSatellite ? "#ffffff10" : "#2e3a1f0d";
      const parcelAccentGrid = isSatellite ? "#ffffff1f" : "#2e3a1f18";
      const parcelBorder = isSatellite ? "#e8efda" : "#2e3a1f";
      const labelColor = isSatellite ? "#f1f6e0bb" : "#2e3a1f55";
      const scaleColor = isSatellite ? "#f1f6e0d0" : "#2e3a1f88";

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = bgFill;
      ctx.fillRect(0, 0, w, h);

      const gridStep = 40;
      ctx.strokeStyle = bgGrid;
      ctx.lineWidth = 0.5;
      const gox = ((vpX % gridStep) + gridStep) % gridStep;
      const goy = ((vpY % gridStep) + gridStep) % gridStep;
      for (let gx = gox - gridStep; gx < w + gridStep; gx += gridStep) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = goy - gridStep; gy < h + gridStep; gy += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      ctx.save();
      const cos = Math.cos(angle), sin = Math.sin(angle);
      ctx.setTransform(zoom * cos, zoom * sin, -zoom * sin, zoom * cos, vpX, vpY);

      const { project, pixelsPerMetre } = makeProjection(area.points, w, h, 80);
      pixelsPerMetreRef.current = pixelsPerMetre;
      const worldPts = area.points.map(project);

      const big = 999999;
      ctx.beginPath();
      ctx.rect(-big, -big, big * 2, big * 2);
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.fillStyle = outsideFill;
      ctx.fill("evenodd");

      ctx.beginPath();
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.fillStyle = parcelFill;
      ctx.fill();

      if (hasSatelliteTiles) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(worldPts[0][0], worldPts[0][1]);
        worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = 0.95;
        satelliteTilesRef.current.forEach((tile) => {
          const west = tileXToLng(tile.x, tile.z);
          const east = tileXToLng(tile.x + 1, tile.z);
          const north = tileYToLat(tile.y, tile.z);
          const south = tileYToLat(tile.y + 1, tile.z);
          const nw = project([north, west]);
          const se = project([south, east]);
          const x = Math.min(nw[0], se[0]);
          const y = Math.min(nw[1], se[1]);
          const w = Math.abs(se[0] - nw[0]);
          const h = Math.abs(se[1] - nw[1]);
          ctx.drawImage(tile.img, x, y, w, h);
        });
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.clip();

      const gridW = pixelsPerMetre; 
      const xs2 = worldPts.map(p => p[0]), ys2 = worldPts.map(p => p[1]);
      const wx0 = Math.floor(Math.min(...xs2) / gridW) * gridW;
      const wy0 = Math.floor(Math.min(...ys2) / gridW) * gridW;
      const wx1 = Math.ceil(Math.max(...xs2) / gridW) * gridW;
      const wy1 = Math.ceil(Math.max(...ys2) / gridW) * gridW;
      ctx.strokeStyle = parcelFineGrid;
      ctx.lineWidth = 0.5 / zoom;
      for (let gx = wx0; gx <= wx1; gx += gridW) {
        ctx.beginPath(); ctx.moveTo(gx, wy0); ctx.lineTo(gx, wy1); ctx.stroke();
      }
      for (let gy = wy0; gy <= wy1; gy += gridW) {
        ctx.beginPath(); ctx.moveTo(wx0, gy); ctx.lineTo(wx1, gy); ctx.stroke();
      }

      ctx.strokeStyle = parcelAccentGrid;
      ctx.lineWidth = 1 / zoom;
      for (let gx = wx0; gx <= wx1; gx += gridW * 5) {
        ctx.beginPath(); ctx.moveTo(gx, wy0); ctx.lineTo(gx, wy1); ctx.stroke();
      }
      for (let gy = wy0; gy <= wy1; gy += gridW * 5) {
        ctx.beginPath(); ctx.moveTo(wx0, gy); ctx.lineTo(wx1, gy); ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.strokeStyle = parcelBorder;
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      if (isSatellite && !hasSatelliteTiles) {
        const cx = worldPts.reduce((sum, p) => sum + p[0], 0) / worldPts.length;
        const cy = worldPts.reduce((sum, p) => sum + p[1], 0) / worldPts.length;
        ctx.save();
        ctx.fillStyle = "#f1f6e0dd";
        ctx.font = `${12 / zoom}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          satImageStatus === "error"
            ? "Satelitní snímky nejsou pro tento pohled dostupné"
            : "Načítám satelitní snímky…",
          cx,
          cy
        );
        ctx.restore();
      }

      ctx.save();
      const lx = worldPts[0][0] + 8 / zoom;
      const ly = worldPts[0][1] + 8 / zoom;
      ctx.font = `${11 / zoom}px sans-serif`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(
        area.areaSqKm < 1
          ? `${(area.areaSqKm * 100).toFixed(1)} ha`
          : `${area.areaSqKm.toFixed(1)} km²`,
        lx, ly
      );
      ctx.restore();

      {
        const barMetres = (() => {
          const candidates = [0.5,1,2,5,10,20,50,100,200,500,1000];
          const targetPx = 80 / zoom;
          return candidates.find(m => m * pixelsPerMetre >= targetPx) ?? 1000;
        })();
        const barPx = barMetres * pixelsPerMetre;
        const bx = Math.min(...xs2) + 10 / zoom;
        const by = Math.max(...ys2) - 20 / zoom;
        ctx.strokeStyle = scaleColor;
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by);
        ctx.moveTo(bx, by - 4 / zoom); ctx.lineTo(bx, by + 4 / zoom);
        ctx.moveTo(bx + barPx, by - 4 / zoom); ctx.lineTo(bx + barPx, by + 4 / zoom);
        ctx.stroke();
        ctx.font = `${10 / zoom}px sans-serif`;
        ctx.fillStyle = scaleColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(barMetres >= 1000 ? `${barMetres/1000}km` : `${barMetres}m`, bx + barPx / 2, by - 5 / zoom);
      }

      elementsRef.current.forEach(el => {
        const catalogItem = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === el.type);
        if (!catalogItem) return;
        drawShape(ctx, { ...catalogItem, rotation: el.rotation || 0 },
          el.x, el.y, el.wPx, el.hPx,
          selectedIdsRef.current.includes(el.id),
          el.id === hoveredIdRef.current);
      });

      ctx.restore();

      rotateHandleRef.current = null;
      if (selectedIdsRef.current.length === 1) {
        const selectedId = selectedIdsRef.current[0];
        const selectedEl = elementsRef.current.find((el) => el.id === selectedId);
        if (selectedEl) {
          const cx = selectedEl.x + selectedEl.wPx / 2;
          const cy = selectedEl.y + selectedEl.hPx / 2;
          const theta = ((selectedEl.rotation || 0) * Math.PI) / 180;
          const orbitDist = selectedEl.hPx / 2 + 28;
          const hxWorld = cx + Math.sin(theta) * orbitDist;
          const hyWorld = cy - Math.cos(theta) * orbitDist;
          const [hx, hy] = worldToScreen(hxWorld, hyWorld);
          const hr = 12;

          rotateHandleRef.current = { id: selectedId, x: hx, y: hy, radius: hr };

          ctx.save();
          const [cxScreen, cyScreen] = worldToScreen(cx, cy);
          ctx.strokeStyle = "#2e3a1f66";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(cxScreen, cyScreen);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
          ctx.fillStyle = "#F4F5E0";
          ctx.fill();
          ctx.strokeStyle = "#2e3a1f";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = "#2e3a1f";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("↻", hx, hy + 0.5);
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(raf);
  }, [area, editorMapStyle, satTilesVersion, satImageStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const prevSize = canvasSize.current;
        const { width, height } = entry.contentRect;

        if (prevSize.w > 0 && prevSize.h > 0 && (width !== prevSize.w || height !== prevSize.h)) {
          const oldProjection = makeProjection(area.points, prevSize.w, prevSize.h, 80);
          const newProjection = makeProjection(area.points, width, height, 80);

          setElements((prev) => prev.map((el) => ({
            ...el,
            ...(() => {
              const topLeftGeo = oldProjection.unproject([el.x, el.y]);
              const bottomRightGeo = oldProjection.unproject([el.x + el.wPx, el.y + el.hPx]);
              const nextTopLeft = newProjection.project(topLeftGeo);
              const nextBottomRight = newProjection.project(bottomRightGeo);
              const nextX = Math.min(nextTopLeft[0], nextBottomRight[0]);
              const nextY = Math.min(nextTopLeft[1], nextBottomRight[1]);
              return {
                x: nextX,
                y: nextY,
                wPx: Math.max(4, Math.abs(nextBottomRight[0] - nextTopLeft[0])),
                hPx: Math.max(4, Math.abs(nextBottomRight[1] - nextTopLeft[1])),
              };
            })(),
          })));
        }

        // Keep the current world center stable when browser/page zoom changes layout size.
        if (vpInitialised.current && prevSize.w > 0 && prevSize.h > 0) {
          const prevCenterX = prevSize.w / 2;
          const prevCenterY = prevSize.h / 2;
          const [centerWx, centerWy] = screenToWorld(prevCenterX, prevCenterY);
          const { zoom, angle } = vp.current;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const nextCenterX = width / 2;
          const nextCenterY = height / 2;
          vp.current = {
            ...vp.current,
            x: nextCenterX - (centerWx * zoom * cos - centerWy * zoom * sin),
            y: nextCenterY - (centerWx * zoom * sin + centerWy * zoom * cos),
          };
        }

        canvas.width = width;
        canvas.height = height;
        canvasSize.current = { w: width, h: height };
        if (!vpInitialised.current) {
          fitParcel();
          vpInitialised.current = true;
        }
      }
    });
    obs.observe(canvas.parentElement);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const [wx, wy] = screenToWorld(sx, sy);
      const { angle } = vp.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(0.05, Math.min(100, vp.current.zoom * factor));
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      vp.current = {
        ...vp.current,
        zoom: newZoom,
        x: sx - (wx * newZoom * cos - wy * newZoom * sin),
        y: sy - (wx * newZoom * sin + wy * newZoom * cos),
      };
      setZoomDisplay(Math.round(newZoom * 100));
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !spaceDown.current) {
        spaceDown.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      }
      if ((e.key === "Delete" || e.key === "Backspace") &&
        (document.activeElement as HTMLElement)?.tagName !== "TEXTAREA" &&
        (document.activeElement as HTMLElement)?.tagName !== "INPUT") {
        if (selectedIdsRef.current.length > 0) {
          const selectedSet = new Set(selectedIdsRef.current);
          setElements(prev => prev.filter(el => !selectedSet.has(el.id)));
          setSelectedIds([]);
        }
      }
      if (e.key === "Escape") setSelectedIds([]);
      if (e.key === "f" || e.key === "F") fitParcel();
      if (e.key === "[") rotateViewport(-15 * Math.PI / 180);
      if (e.key === "]") rotateViewport(15 * Math.PI / 180);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceDown.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = "default";
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  function rotateViewport(delta: number) {
    const { w, h } = canvasSize.current;
    const cx = w / 2, cy = h / 2;
    const { x, y, zoom, angle } = vp.current;
    const newAngle = angle + delta;
    const cos = Math.cos(delta), sin = Math.sin(delta);
    const dx = x - cx, dy = y - cy;
    vp.current = {
      zoom,
      angle: newAngle,
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  }

  function normalizeDeg(deg: number): number {
    return ((deg % 360) + 360) % 360;
  }

  function pointerAngleDegFromCenter(cx: number, cy: number, sx: number, sy: number): number {
    return normalizeDeg((Math.atan2(sx - cx, -(sy - cy)) * 180) / Math.PI);
  }

  function startRotateDrag(id: string, sx: number, sy: number) {
    const el = elementsRef.current.find((item) => item.id === id);
    if (!el) return;
    const [cx, cy] = worldToScreen(el.x + el.wPx / 2, el.y + el.hPx / 2);
    const pointerDeg = pointerAngleDegFromCenter(cx, cy, sx, sy);
    const currentDeg = normalizeDeg(el.rotation || 0);
    rotateDragRef.current = { id, angleOffsetDeg: pointerDeg - currentDeg };
    if (!spaceDown.current && canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }

  function stopRotateDrag() {
    rotateDragRef.current = null;
  }

  function hitTest(wx: number, wy: number): PlacedElement | null {
    const elems = [...elementsRef.current].reverse();
    for (const el of elems) {
      if (wx >= el.x && wx <= el.x + el.wPx && wy >= el.y && wy <= el.y + el.hPx) return el;
    }
    return null;
  }

  function hitTestScreen(sx: number, sy: number): PlacedElement | null {
    const elems = [...elementsRef.current].reverse();
    for (const el of elems) {
      const corners: [number, number][] = [
        worldToScreen(el.x, el.y),
        worldToScreen(el.x + el.wPx, el.y),
        worldToScreen(el.x + el.wPx, el.y + el.hPx),
        worldToScreen(el.x, el.y + el.hPx),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const left = Math.min(...xs) - HIT_PADDING_PX;
      const right = Math.max(...xs) + HIT_PADDING_PX;
      const top = Math.min(...ys) - HIT_PADDING_PX;
      const bottom = Math.max(...ys) + HIT_PADDING_PX;
      if (sx >= left && sx <= right && sy >= top && sy <= bottom) return el;
    }
    return null;
  }

  function getCanvasXY(e: React.MouseEvent | MouseEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function canPlaceElementAt(x: number, y: number, wPx: number, hPx: number): boolean {
    const { w, h } = canvasSize.current;
    if (!w || !h) return false;
    const { project } = makeProjection(area.points, w, h, 80);
    const parcelWorldPoints = area.points.map(project);
    return rectWithinPolygon(x, y, wPx, hPx, parcelWorldPoints);
  }

  function getElementsInScreenRect(x0: number, y0: number, x1: number, y1: number): string[] {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);

    return elementsRef.current
      .filter((el) => {
        const corners: [number, number][] = [
          worldToScreen(el.x, el.y),
          worldToScreen(el.x + el.wPx, el.y),
          worldToScreen(el.x + el.wPx, el.y + el.hPx),
          worldToScreen(el.x, el.y + el.hPx),
        ];
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const elLeft = Math.min(...xs);
        const elRight = Math.max(...xs);
        const elTop = Math.min(...ys);
        const elBottom = Math.max(...ys);
        return !(elRight < left || elLeft > right || elBottom < top || elTop > bottom);
      })
      .map((el) => el.id);
  }

  function onMouseDown(e: React.MouseEvent) {
    const [sx, sy] = getCanvasXY(e);

    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      panState.current = { startX: sx, startY: sy, startVpX: vp.current.x, startVpY: vp.current.y };
      canvasRef.current!.style.cursor = "grabbing";
      return;
    }

    if (e.button !== 0) return;

    const handle = rotateHandleRef.current;
    if (handle) {
      const dx = sx - handle.x;
      const dy = sy - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= handle.radius + 2) {
        startRotateDrag(handle.id, sx, sy);
        return;
      }
    }

    const [wx, wy] = screenToWorld(sx, sy);
    const hit = hitTestScreen(sx, sy);
    if (hit) {
      if (e.shiftKey) {
        setSelectedIds((prev) => (
          prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : [...prev, hit.id]
        ));
        return;
      }

      const dragIds = selectedIdsRef.current.includes(hit.id) ? selectedIdsRef.current : [hit.id];
      if (!selectedIdsRef.current.includes(hit.id)) setSelectedIds([hit.id]);

      const startPositions: Record<string, { x: number; y: number }> = {};
      elementsRef.current.forEach((el) => {
        if (dragIds.includes(el.id)) startPositions[el.id] = { x: el.x, y: el.y };
      });
      const anchorX = Math.max(hit.x, Math.min(wx, hit.x + hit.wPx));
      const anchorY = Math.max(hit.y, Math.min(wy, hit.y + hit.hPx));
      dragState.current = {
        ids: dragIds,
        startWorldX: anchorX,
        startWorldY: anchorY,
        startPositions,
      };
    } else {
      marqueeState.current = { startX: sx, startY: sy, additive: e.shiftKey };
      setSelectionBox({ startX: sx, startY: sy, x: sx, y: sy });
      if (!e.shiftKey) setSelectedIds([]);
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const [sx, sy] = getCanvasXY(e);

    if (panState.current) {
      const { startX, startY, startVpX, startVpY } = panState.current;
      vp.current = { ...vp.current, x: startVpX + sx - startX, y: startVpY + sy - startY };
      return;
    }

    if (rotateDragRef.current) {
      const { id, angleOffsetDeg } = rotateDragRef.current;
      const el = elementsRef.current.find((item) => item.id === id);
      if (!el) {
        stopRotateDrag();
        return;
      }
      const [cx, cy] = worldToScreen(el.x + el.wPx / 2, el.y + el.hPx / 2);
      const pointerDeg = pointerAngleDegFromCenter(cx, cy, sx, sy);
      const nextDeg = normalizeDeg(pointerDeg - angleOffsetDeg);
      setElements((prev) => prev.map((item) => (
        item.id === id ? { ...item, rotation: nextDeg } : item
      )));
      if (!spaceDown.current) canvasRef.current!.style.cursor = "grabbing";
      return;
    }

    if (dragState.current) {
      const { ids, startWorldX, startWorldY, startPositions } = dragState.current;
      const [wx, wy] = screenToWorld(sx, sy);
      const dx = wx - startWorldX;
      const dy = wy - startWorldY;
      const nextById: Record<string, { x: number; y: number }> = {};

      for (const id of ids) {
        const draggingElement = elementsRef.current.find((el) => el.id === id);
        const startPos = startPositions[id];
        if (!draggingElement || !startPos) continue;
        const nextX = snapTo(startPos.x + dx);
        const nextY = snapTo(startPos.y + dy);
        if (!canPlaceElementAt(nextX, nextY, draggingElement.wPx, draggingElement.hPx)) return;
        nextById[id] = { x: nextX, y: nextY };
      }

      setElements((prev) => prev.map((el) => {
        const next = nextById[el.id];
        return next ? { ...el, x: next.x, y: next.y } : el;
      }));
      return;
    }

    if (marqueeState.current) {
      setSelectionBox((prev) => (prev ? { ...prev, x: sx, y: sy } : null));
      return;
    }

    const handle = rotateHandleRef.current;
    if (handle) {
      const dx = sx - handle.x;
      const dy = sy - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= handle.radius + 2) {
        setHoveredId(null);
        if (!spaceDown.current) canvasRef.current!.style.cursor = "pointer";
        return;
      }
    }

    const [wx, wy] = screenToWorld(sx, sy);
    const hit = hitTestScreen(sx, sy) ?? hitTest(wx, wy);
    setHoveredId(hit ? hit.id : null);
    if (!spaceDown.current) {
      canvasRef.current!.style.cursor = hit ? "move" : "default";
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    stopRotateDrag();
    const [sx, sy] = getCanvasXY(e);
    if (panState.current) {
      panState.current = null;
      canvasRef.current!.style.cursor = spaceDown.current ? "grab" : "default";
    }
    dragState.current = null;

    if (marqueeState.current) {
      const { startX, startY, additive } = marqueeState.current;
      const width = Math.abs(sx - startX);
      const height = Math.abs(sy - startY);

      if (width >= 4 || height >= 4) {
        const idsInBox = getElementsInScreenRect(startX, startY, sx, sy);
        if (additive) {
          setSelectedIds((prev) => Array.from(new Set([...prev, ...idsInBox])));
        } else {
          setSelectedIds(idsInBox);
        }
      } else if (!additive) {
        setSelectedIds([]);
      }
    }

    marqueeState.current = null;
    setSelectionBox(null);
  }

  useEffect(() => {
    function onWindowMouseUp() {
      stopRotateDrag();
      if (panState.current) {
        panState.current = null;
        if (canvasRef.current) {
          canvasRef.current.style.cursor = spaceDown.current ? "grab" : "default";
        }
      }
      dragState.current = null;
    }

    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  function onCatalogDragStart(e: React.DragEvent, item: any) {
    draggingCatalogItem.current = item;
    e.dataTransfer.effectAllowed = "copy";
  }

  function onCanvasDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const item = draggingCatalogItem.current;
    if (!item) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(sx, sy);

    const ppm = pixelsPerMetreRef.current;
    const baseW = Math.max(0.0001, item.w * ppm);
    const baseH = Math.max(0.0001, item.h * ppm);
    const minVisiblePx = 6;
    const preserveRatioScale = Math.max(minVisiblePx / baseW, minVisiblePx / baseH, 1);
    const wPx = baseW * preserveRatioScale;
    const hPx = baseH * preserveRatioScale;

    const newEl: PlacedElement = {
      id: genId(), type: item.type,
      x: snapTo(wx - wPx / 2),
      y: snapTo(wy - hPx / 2),
      wPx, hPx, rotation: 0,
    };
    if (!canPlaceElementAt(newEl.x, newEl.y, newEl.wPx, newEl.hPx)) {
      draggingCatalogItem.current = null;
      return;
    }
    setElements(prev => [...prev, newEl]);
    setSelectedIds([newEl.id]);
    draggingCatalogItem.current = null;
  }

  const selectedElement = selectedIds.length === 1
    ? (elements.find(el => el.id === selectedIds[0]) ?? null)
    : null;
  const categories = ELEMENT_CATALOG.map(c => c.category);
  const filteredCatalog = ELEMENT_CATALOG
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        (!activeCategory || cat.category === activeCategory) &&
        (item.label.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
          cat.category.toLowerCase().includes(sidebarSearch.toLowerCase()))
      ),
    }))
    .filter(cat => cat.items.length > 0);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 4000, display: "flex", flexDirection: "column", background: "#F4F5E0" }}>

      {/* ── Header ── */}
      <header style={{ height: 52, flexShrink: 0, borderBottom: "1.5px solid #2e3a1f22", display: "flex", alignItems: "center", background: "#F4F5E0" }}>
        <button onClick={onBack} style={{ height: "100%", padding: "0 20px", borderRight: "1.5px solid #2e3a1f22", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 13, fontFamily: "inherit", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>←</span> Zpět
        </button>
        <div style={{ padding: "0 20px", flex: 1, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 16, fontStyle: "italic", color: "#2e3a1f" }}>Editor parcely</span>
          <span style={{ color: "#2e3a1f33" }}>·</span>
          <span style={{ fontSize: 12, color: "#2e3a1f66", letterSpacing: "0.04em" }}>
            {elements.length} {elements.length === 1 ? "prvek" : elements.length >= 2 && elements.length <= 4 ? "prvky" : "prvků"}
          </span>
          <span style={{ color: "#2e3a1f33" }}>·</span>
          <span style={{ fontSize: 12, color: "#2e3a1f66", fontStyle: "italic" }}>
            {area.areaSqKm < 1 ? `${(area.areaSqKm * 100).toFixed(1)} ha` : `${area.areaSqKm.toFixed(1)} km²`}
          </span>
        </div>

        {/* Viewport controls */}
        <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 0, borderLeft: "1.5px solid #2e3a1f22", borderRight: "1.5px solid #2e3a1f22" }}>
          {/* Rotate CCW */}
          <button title="Otočit pohled o −15° ( [ )" onClick={() => rotateViewport(-15 * Math.PI / 180)}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f88", fontSize: 14, fontFamily: "inherit" }}>
            ↺
          </button>
          {/* Zoom display + fit */}
          <button title="Přizpůsobit parcelu na obrazovku ( F )" onClick={fitParcel}
            style={{ height: "100%", padding: "0 10px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.04em", minWidth: 52, textAlign: "center" }}>
            {zoomDisplay}%
          </button>
          {/* Rotate CW */}
          <button title="Otočit pohled o +15° ( ] )" onClick={() => rotateViewport(15 * Math.PI / 180)}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f88", fontSize: 14, fontFamily: "inherit" }}>
            ↻
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%", borderRight: "1.5px solid #2e3a1f22", padding: "0 8px", gap: 6 }}>
          <button
            onClick={() => setEditorMapStyle("map")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1.5px solid #2e3a1f33",
              background: editorMapStyle === "map" ? "#2e3a1f" : "transparent",
              color: editorMapStyle === "map" ? "#F4F5E0" : "#2e3a1f88",
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Mapa
          </button>
          <button
            onClick={() => setEditorMapStyle("satellite")}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1.5px solid #2e3a1f33",
              background: editorMapStyle === "satellite" ? "#2e3a1f" : "transparent",
              color: editorMapStyle === "satellite" ? "#F4F5E0" : "#2e3a1f88",
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Satelit
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          <button onClick={() => { setElements([]); setSelectedIds([]); }} style={{ height: "100%", padding: "0 16px", background: "none", border: "none", borderRight: "1.5px solid #2e3a1f22", cursor: "pointer", color: "#2e3a1f77", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            Vymazat vše
          </button>
          <button style={{ height: "100%", padding: "0 20px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            Exportovat plán
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left sidebar */}
        <aside style={{ width: 220, flexShrink: 0, borderRight: "1.5px solid #2e3a1f22", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px", borderBottom: "1.5px solid #2e3a1f11" }}>
            <input value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} placeholder="Hledat prvky…"
              style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #2e3a1f22", borderRadius: 3, background: "#2e3a1f08", fontSize: 12, fontFamily: "inherit", color: "#2e3a1f", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 10px", borderBottom: "1.5px solid #2e3a1f11" }}>
            <button onClick={() => setActiveCategory(null)}
              style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 3, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", borderColor: activeCategory === null ? "#2e3a1f" : "#2e3a1f33", background: activeCategory === null ? "#2e3a1f" : "transparent", color: activeCategory === null ? "#F4F5E0" : "#2e3a1f77" }}>
              Vše
            </button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 3, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", borderColor: activeCategory === cat ? "#2e3a1f" : "#2e3a1f33", background: activeCategory === cat ? "#2e3a1f" : "transparent", color: activeCategory === cat ? "#F4F5E0" : "#2e3a1f77" }}>
                {cat}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {filteredCatalog.map(cat => (
              <div key={cat.category} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f55", marginBottom: 6, padding: "0 4px" }}>{cat.category}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                  {cat.items.map(item => <CatalogItem key={item.type} item={item} onDragStart={onCatalogDragStart} />)}
                </div>
              </div>
            ))}
            {filteredCatalog.length === 0 && (
              <div style={{ fontSize: 12, color: "#2e3a1f44", fontStyle: "italic", textAlign: "center", paddingTop: 20 }}>Nenalezeny žádné prvky</div>
            )}
          </div>
          <div style={{ padding: "10px 12px", borderTop: "1.5px solid #2e3a1f11", fontSize: 10, color: "#2e3a1f44", lineHeight: 1.6 }}>
            Přetáhněte pro umístění · Shift+klik pro vícenásobný výběr · Tažením v prázdném prostoru vyberete oblast · Kolečkem přiblížíte · Prostřední tlačítko nebo mezerník+tažení pro posun
          </div>
        </aside>

        {/* Canvas area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}
          onDragOver={onCanvasDragOver} onDrop={onCanvasDrop} onDragLeave={() => setIsDragOver(false)}>
          {isDragOver && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, border: "3px dashed #2e3a1f66", background: "#2e3a1f08", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 14, color: "#2e3a1f88", fontStyle: "italic" }}>Pusťte pro umístění</span>
            </div>
          )}
          <canvas ref={canvasRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
          {selectionBox && (
            <div
              style={{
                position: "absolute",
                left: Math.min(selectionBox.startX, selectionBox.x),
                top: Math.min(selectionBox.startY, selectionBox.y),
                width: Math.abs(selectionBox.x - selectionBox.startX),
                height: Math.abs(selectionBox.y - selectionBox.startY),
                border: "1.5px dashed #2e3a1faa",
                background: "#2e3a1f1a",
                pointerEvents: "none",
                zIndex: 8,
              }}
            />
          )}
          {elements.length === 0 && !isDragOver && (
            <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
              <p style={{ fontSize: 12, color: "#2e3a1f55", fontStyle: "italic", whiteSpace: "nowrap" }}>
                Přetáhněte prvky z panelu na parcelu
              </p>
            </div>
          )}
        </div>

        {/* Right sidebar: inspector */}
        <aside style={{ width: 200, flexShrink: 0, borderLeft: "1.5px solid #2e3a1f22", overflowY: "auto" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #2e3a1f11", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88" }}>
            Inspektor
          </div>
          <PropertiesPanel
            item={selectedElement}
            selectedCount={selectedIds.length}
            onChange={updated => setElements(prev => prev.map(el => el.id === updated.id ? updated : el))}
            onDelete={() => {
              const selectedSet = new Set(selectedIds);
              setElements(prev => prev.filter(el => !selectedSet.has(el.id)));
              setSelectedIds([]);
            }}
          />
          {selectedIds.length > 1 && (
            <div style={{ padding: "12px 16px", borderTop: "1.5px solid #2e3a1f11", color: "#2e3a1f77", fontSize: 11, lineHeight: 1.5 }}>
              Vybráno prvků: {selectedIds.length}
              <button
                onClick={() => {
                  const selectedSet = new Set(selectedIds);
                  setElements((prev) => prev.filter((el) => !selectedSet.has(el.id)));
                  setSelectedIds([]);
                }}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "8px",
                  background: "none",
                  border: "1.5px solid #cc444422",
                  borderRadius: 3,
                  color: "#cc4444",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.04em",
                }}
              >
                Odebrat vybrané
              </button>
            </div>
          )}
          {elements.length > 0 && (
            <div style={{ borderTop: "1.5px solid #2e3a1f11", marginTop: 8 }}>
              <div style={{ padding: "12px 16px 6px", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88" }}>
                Vrstvy ({elements.length})
              </div>
              {[...elements].reverse().map(el => {
                const cat = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === el.type);
                const isSelected = selectedIds.includes(el.id);
                return (
                  <div
                    key={el.id}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        setSelectedIds((prev) => (
                          prev.includes(el.id) ? prev.filter((id) => id !== el.id) : [...prev, el.id]
                        ));
                        return;
                      }
                      setSelectedIds(isSelected ? [] : [el.id]);
                    }}
                    style={{ padding: "7px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: isSelected ? "#2e3a1f0d" : "transparent", borderLeft: isSelected ? "2.5px solid #2e3a1f" : "2.5px solid transparent", transition: "all 0.1s" }}
                  >
                    <span style={{ fontSize: 14 }}>{cat?.icon}</span>
                    <span style={{ fontSize: 11, color: "#2e3a1f", letterSpacing: "0.02em" }}>{cat?.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
