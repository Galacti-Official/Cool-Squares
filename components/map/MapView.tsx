"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

// ─── Geo → canvas projection ──────────────────────────────────────────────────
// Returns both a project() function and pixelsPerMetre so elements can be
// drawn at true scale relative to the parcel.
function makeProjection(
  points: [number, number][],
  canvasW: number,
  canvasH: number,
  pad = 60
): { project: (pt: [number, number]) => [number, number]; pixelsPerMetre: number } {
  const lats = points.map(p => p[0]);
  const lngs = points.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;

  // Real-world width of the bounding box in metres
  const R = 6371000;
  const bboxWMetres = ((maxLng - minLng) * Math.PI / 180) * R * Math.cos(midLat * Math.PI / 180);

  // Available drawing area
  const drawW = canvasW - pad * 2;
  const drawH = canvasH - pad * 2;

  // Aspect-correct scale in pixels-per-degree
  const bboxW = maxLng - minLng || 0.0001;
  const bboxH = maxLat - minLat || 0.0001;
  const scaleX = drawW / bboxW;
  const scaleY = drawH / bboxH;
  const scaleDeg = Math.min(scaleX, scaleY);

  // pixels per metre derived from the horizontal (lng) axis
  const pixelsPerMetre = bboxWMetres > 0
    ? (bboxW * scaleDeg) / bboxWMetres
    : 1;

  // Centre the fitted bbox in the drawing area
  const fittedW = bboxW * scaleDeg;
  const fittedH = bboxH * scaleDeg;
  const offsetX = pad + (drawW - fittedW) / 2;
  const offsetY = pad + (drawH - fittedH) / 2;

  const project = ([lat, lng]: [number, number]): [number, number] => [
    offsetX + (lng - minLng) * scaleDeg,
    offsetY + (maxLat - lat) * scaleDeg,
  ];

  return { project, pixelsPerMetre };
}

// ─── Element catalog ──────────────────────────────────────────────────────────
// w / h are in METRES — they get converted to pixels at drop time using
// the parcel's pixelsPerMetre scale.
const ELEMENT_CATALOG = [
  {
    category: "Containers",
    items: [
      { type: "pot_small",    label: "Small Pot",      icon: "🪴", w: 0.30, h: 0.30, shape: "circle",  color: "#8B6F47", desc: "ø 30 cm" },
      { type: "pot_large",    label: "Large Pot",      icon: "🏺", w: 0.50, h: 0.50, shape: "circle",  color: "#7A5C3A", desc: "ø 50 cm" },
      { type: "planter_box",  label: "Planter Box",    icon: "▭",  w: 1.20, h: 0.50, shape: "rect",    color: "#6B4F2E", desc: "120×50 cm" },
      { type: "window_box",   label: "Window Box",     icon: "▭",  w: 0.80, h: 0.25, shape: "rect",    color: "#8B6F47", desc: "80×25 cm" },
      { type: "hanging",      label: "Hanging Basket", icon: "⊕",  w: 0.30, h: 0.30, shape: "circle",  color: "#9E7B56", desc: "ø 30 cm" },
    ],
  },
  {
    category: "Grow Beds",
    items: [
      { type: "bed_small",    label: "Raised Bed S",   icon: "▬",  w: 1.20, h: 0.80, shape: "rect",    color: "#4A7C59", desc: "120×80 cm" },
      { type: "bed_medium",   label: "Raised Bed M",   icon: "▬",  w: 2.00, h: 1.00, shape: "rect",    color: "#3D6B4A", desc: "200×100 cm" },
      { type: "bed_large",    label: "Raised Bed L",   icon: "▬",  w: 3.00, h: 1.20, shape: "rect",    color: "#336040", desc: "300×120 cm" },
      { type: "bed_round",    label: "Round Bed",      icon: "◯",  w: 1.20, h: 1.20, shape: "circle",  color: "#4A7C59", desc: "ø 120 cm" },
      { type: "keyhole",      label: "Keyhole Bed",    icon: "◌",  w: 1.80, h: 1.80, shape: "keyhole", color: "#5A8C6A", desc: "ø 180 cm" },
    ],
  },
  {
    category: "Structures",
    items: [
      { type: "trellis",      label: "Trellis",        icon: "⊞",  w: 2.00, h: 0.20, shape: "rect",    color: "#8B7355", desc: "200×20 cm" },
      { type: "arch",         label: "Garden Arch",    icon: "⌢",  w: 0.80, h: 0.30, shape: "arch",    color: "#7A6445", desc: "80×30 cm" },
      { type: "coldframe",    label: "Cold Frame",     icon: "▦",  w: 1.20, h: 0.80, shape: "rect",    color: "#6B8C9E", desc: "120×80 cm" },
      { type: "greenhouse",   label: "Mini GH",        icon: "🏠", w: 2.00, h: 1.50, shape: "rect",    color: "#82A8BC", desc: "200×150 cm" },
      { type: "compost",      label: "Compost Bin",    icon: "♻",  w: 0.80, h: 0.80, shape: "rect",    color: "#7A6840", desc: "80×80 cm" },
    ],
  },
  {
    category: "Water",
    items: [
      { type: "water_barrel", label: "Water Barrel",   icon: "⬤",  w: 0.60, h: 0.60, shape: "circle",  color: "#5B7FA0", desc: "200 L" },
      { type: "water_tank",   label: "IBC Tank",       icon: "▣",  w: 1.00, h: 1.20, shape: "rect",    color: "#4A6E8F", desc: "1000 L" },
      { type: "pond",         label: "Mini Pond",      icon: "◯",  w: 1.50, h: 1.00, shape: "ellipse", color: "#3D6B8A", desc: "150×100 cm" },
      { type: "tap",          label: "Tap Point",      icon: "⊕",  w: 0.10, h: 0.10, shape: "circle",  color: "#5B7FA0", desc: "tap" },
    ],
  },
  {
    category: "Paths",
    items: [
      { type: "path_h",       label: "Path (H)",       icon: "—",  w: 2.00, h: 0.60, shape: "rect",    color: "#C4B89A", desc: "200×60 cm" },
      { type: "path_v",       label: "Path (V)",       icon: "|",  w: 0.60, h: 2.00, shape: "rect",    color: "#C4B89A", desc: "60×200 cm" },
      { type: "seating",      label: "Seating Area",   icon: "◻",  w: 3.00, h: 3.00, shape: "rect",    color: "#B8A882", desc: "300×300 cm" },
    ],
  },
];

const SNAP = 5; // pixels — finer snap since elements are now scaled to real size
function snapTo(v: number) { return Math.round(v / SNAP) * SNAP; }
function genId() { return Math.random().toString(36).slice(2, 9); }

interface PlacedElement {
  id: string;
  type: string;
  x: number;     // canvas px
  y: number;     // canvas px
  wPx: number;   // canvas px (derived from metres * pixelsPerMetre)
  hPx: number;   // canvas px
  rotation: number;
  note?: string;
}

// ─── Canvas shape renderer ────────────────────────────────────────────────────
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

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#2e3a1f";
  ctx.font = `${Math.max(9, Math.min(11, w / 10))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = item.label.length > 12 ? item.label.slice(0, 11) + "…" : item.label;
  ctx.fillText(label, 0, 0);

  // Selection: just a dashed outline highlight, no handles
  if (selected) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#2e3a1f";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    if (shape === "circle" || shape === "ellipse" || shape === "keyhole") {
      ctx.beginPath();
      ctx.ellipse(0, 0, hw + 4, hh + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(-hw - 4, -hh - 4, w + 8, h + 8);
    }
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ─── Sidebar catalog item ──────────────────────────────────────────────────────
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

// ─── Properties panel ─────────────────────────────────────────────────────────
function PropertiesPanel({
  item,
  onChange,
  onDelete,
}: {
  item: PlacedElement | null;
  onChange: (item: PlacedElement) => void;
  onDelete: () => void;
}) {
  if (!item) return (
    <div style={{ padding: "20px 16px", color: "#2e3a1f55", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
      Select an element to edit its properties
    </div>
  );

  const catalogItem = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === item.type);

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88", marginBottom: 12 }}>
        Properties
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: "#2e3a1f", fontStyle: "italic", marginBottom: 2 }}>{catalogItem?.label}</div>
        <div style={{ fontSize: 11, color: "#2e3a1f55" }}>{catalogItem?.desc}</div>
        <div style={{ fontSize: 10, color: "#2e3a1f44", marginTop: 4 }}>
          {item.wPx}×{item.hPx} px on canvas
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f77", marginBottom: 4 }}>
          Rotation (°)
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
          Note
        </div>
        <textarea
          value={item.note || ""}
          onChange={e => onChange({ ...item, note: e.target.value })}
          placeholder="Add a note…"
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
        Remove element
      </button>
    </div>
  );
}

// ─── Parcel Editor ────────────────────────────────────────────────────────────
// Interaction map:
//   Scroll wheel          → zoom toward cursor
//   Middle-click drag     → pan
//   Space + left drag     → pan
//   Left drag on element  → move element (world space)
//   Click empty           → deselect
//   Delete / Backspace    → remove selected
//   Escape                → deselect
//   F                     → fit parcel to screen
//   [ / ]                 → rotate viewport ±15°
//   Toolbar buttons       → rotate ±15°, reset view, fit

interface Viewport {
  x: number;    // pan x (screen offset)
  y: number;    // pan y (screen offset)
  zoom: number;
  angle: number; // radians
}

function ParcelEditor({ area, onBack }: { area: SelectedArea; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<PlacedElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [zoomDisplay, setZoomDisplay] = useState(100);

  // All mutable interaction state lives in refs to avoid stale closures in RAF
  const elementsRef = useRef(elements);
  const selectedIdRef = useRef(selectedId);
  const hoveredIdRef = useRef(hoveredId);
  const canvasSize = useRef({ w: 800, h: 600 });
  const pixelsPerMetreRef = useRef(1);
  const draggingCatalogItem = useRef<any>(null);

  // Viewport ref — single source of truth, mutated directly for perf
  const vp = useRef<Viewport>({ x: 0, y: 0, zoom: 1, angle: 0 });
  const vpInitialised = useRef(false);

  // Interaction state refs
  const panState = useRef<{ startX: number; startY: number; startVpX: number; startVpY: number } | null>(null);
  const dragState = useRef<{ id: string; worldOffsetX: number; worldOffsetY: number } | null>(null);
  const spaceDown = useRef(false);

  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);

  // ── Viewport helpers ────────────────────────────────────────────────────────

  // Convert screen (canvas) coords → world coords
  function screenToWorld(sx: number, sy: number): [number, number] {
    const { x, y, zoom, angle } = vp.current;
    const dx = sx - x, dy = sy - y;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    return [
      (dx * cos - dy * sin) / zoom,
      (dx * sin + dy * cos) / zoom,
    ];
  }

  // Convert world coords → screen coords
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
    // Use the base projection at zoom=1 angle=0 to find world-space bounds
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
    pixelsPerMetreRef.current = pixelsPerMetre * zoom;
    setZoomDisplay(Math.round(zoom * 100));
  }

  // Initialise viewport once canvas is sized
  useEffect(() => {
    if (!vpInitialised.current && canvasSize.current.w > 100) {
      fitParcel();
      vpInitialised.current = true;
    }
  });

  // ── Render loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;

    function render() {
      const { w, h } = canvasSize.current;
      const { x: vpX, y: vpY, zoom, angle } = vp.current;

      ctx.clearRect(0, 0, w, h);

      // ── Infinite background (screen space) ──
      ctx.fillStyle = "#d6d7c3";
      ctx.fillRect(0, 0, w, h);

      // ── Draw subtle infinite grid on background (screen space) ──
      const gridStep = 40;
      ctx.strokeStyle = "#c8c9b544";
      ctx.lineWidth = 0.5;
      // offset by viewport pan so grid appears fixed in world
      const gox = ((vpX % gridStep) + gridStep) % gridStep;
      const goy = ((vpY % gridStep) + gridStep) % gridStep;
      for (let gx = gox - gridStep; gx < w + gridStep; gx += gridStep) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = goy - gridStep; gy < h + gridStep; gy += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      // ── Apply viewport transform for all world-space drawing ──
      ctx.save();
      const cos = Math.cos(angle), sin = Math.sin(angle);
      ctx.setTransform(zoom * cos, zoom * sin, -zoom * sin, zoom * cos, vpX, vpY);

      // Base projection: maps geo→world pixels (at zoom=1, angle=0)
      const { project, pixelsPerMetre } = makeProjection(area.points, w, h, 80);
      // Keep pixelsPerMetre in sync with current zoom for drop sizing
      pixelsPerMetreRef.current = pixelsPerMetre * zoom;
      const worldPts = area.points.map(project);

      // Outside-parcel dim (filled using evenodd in world space)
      // Draw a large rect covering all world space, punch out parcel
      const big = 999999;
      ctx.beginPath();
      ctx.rect(-big, -big, big * 2, big * 2);
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.fillStyle = "#d6d7c3cc";
      ctx.fill("evenodd");

      // Parcel interior fill
      ctx.beginPath();
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.fillStyle = "#F4F5E0";
      ctx.fill();

      // Fine grid inside parcel (world space, clipped)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.clip();
      // Grid spacing: 1 metre in world pixels
      const gridW = pixelsPerMetre; // 1m in world pixels
      const xs2 = worldPts.map(p => p[0]), ys2 = worldPts.map(p => p[1]);
      const wx0 = Math.floor(Math.min(...xs2) / gridW) * gridW;
      const wy0 = Math.floor(Math.min(...ys2) / gridW) * gridW;
      const wx1 = Math.ceil(Math.max(...xs2) / gridW) * gridW;
      const wy1 = Math.ceil(Math.max(...ys2) / gridW) * gridW;
      ctx.strokeStyle = "#2e3a1f0d";
      ctx.lineWidth = 0.5 / zoom;
      for (let gx = wx0; gx <= wx1; gx += gridW) {
        ctx.beginPath(); ctx.moveTo(gx, wy0); ctx.lineTo(gx, wy1); ctx.stroke();
      }
      for (let gy = wy0; gy <= wy1; gy += gridW) {
        ctx.beginPath(); ctx.moveTo(wx0, gy); ctx.lineTo(wx1, gy); ctx.stroke();
      }
      // 5m accent lines
      ctx.strokeStyle = "#2e3a1f18";
      ctx.lineWidth = 1 / zoom;
      for (let gx = wx0; gx <= wx1; gx += gridW * 5) {
        ctx.beginPath(); ctx.moveTo(gx, wy0); ctx.lineTo(gx, wy1); ctx.stroke();
      }
      for (let gy = wy0; gy <= wy1; gy += gridW * 5) {
        ctx.beginPath(); ctx.moveTo(wx0, gy); ctx.lineTo(wx1, gy); ctx.stroke();
      }
      ctx.restore();

      // Parcel border
      ctx.beginPath();
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.strokeStyle = "#2e3a1f";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      // Parcel area label (screen-size text regardless of zoom)
      ctx.save();
      const lx = worldPts[0][0] + 8 / zoom;
      const ly = worldPts[0][1] + 8 / zoom;
      ctx.font = `${11 / zoom}px sans-serif`;
      ctx.fillStyle = "#2e3a1f55";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(
        area.areaSqKm < 1
          ? `${(area.areaSqKm * 100).toFixed(1)} ha`
          : `${area.areaSqKm.toFixed(1)} km²`,
        lx, ly
      );
      ctx.restore();

      // Scale bar (bottom-left, world space so it scales with zoom)
      {
        const barMetres = (() => {
          const candidates = [0.5,1,2,5,10,20,50,100,200,500,1000];
          const targetPx = 80 / zoom;
          return candidates.find(m => m * pixelsPerMetre >= targetPx) ?? 1000;
        })();
        const barPx = barMetres * pixelsPerMetre;
        const bx = Math.min(...xs2) + 10 / zoom;
        const by = Math.max(...ys2) - 20 / zoom;
        ctx.strokeStyle = "#2e3a1f88";
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by);
        ctx.moveTo(bx, by - 4 / zoom); ctx.lineTo(bx, by + 4 / zoom);
        ctx.moveTo(bx + barPx, by - 4 / zoom); ctx.lineTo(bx + barPx, by + 4 / zoom);
        ctx.stroke();
        ctx.font = `${10 / zoom}px sans-serif`;
        ctx.fillStyle = "#2e3a1f88";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(barMetres >= 1000 ? `${barMetres/1000}km` : `${barMetres}m`, bx + barPx / 2, by - 5 / zoom);
      }

      // Elements
      elementsRef.current.forEach(el => {
        const catalogItem = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === el.type);
        if (!catalogItem) return;
        drawShape(ctx, { ...catalogItem, rotation: el.rotation || 0 },
          el.x, el.y, el.wPx, el.hPx,
          el.id === selectedIdRef.current,
          el.id === hoveredIdRef.current);
      });

      ctx.restore(); // end viewport transform

      raf = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(raf);
  }, [area]);

  // ── Resize canvas ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
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

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(0.05, Math.min(100, vp.current.zoom * factor));
      // Zoom toward cursor: keep world point under cursor stationary
      vp.current = {
        ...vp.current,
        zoom: newZoom,
        x: sx - (sx - vp.current.x) * (newZoom / vp.current.zoom),
        y: sy - (sy - vp.current.y) * (newZoom / vp.current.zoom),
      };
      setZoomDisplay(Math.round(newZoom * 100));
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !spaceDown.current) {
        spaceDown.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      }
      if ((e.key === "Delete" || e.key === "Backspace") &&
        (document.activeElement as HTMLElement)?.tagName !== "TEXTAREA" &&
        (document.activeElement as HTMLElement)?.tagName !== "INPUT") {
        if (selectedIdRef.current) {
          setElements(prev => prev.filter(el => el.id !== selectedIdRef.current));
          setSelectedId(null);
        }
      }
      if (e.key === "Escape") setSelectedId(null);
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
    // Rotate viewport around canvas centre
    const cos = Math.cos(delta), sin = Math.sin(delta);
    const dx = x - cx, dy = y - cy;
    vp.current = {
      zoom,
      angle: newAngle,
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  }

  // ── Hit test (world space) ──────────────────────────────────────────────────
  function hitTest(wx: number, wy: number): PlacedElement | null {
    const elems = [...elementsRef.current].reverse();
    for (const el of elems) {
      if (wx >= el.x && wx <= el.x + el.wPx && wy >= el.y && wy <= el.y + el.hPx) return el;
    }
    return null;
  }

  function getCanvasXY(e: React.MouseEvent | MouseEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    const [sx, sy] = getCanvasXY(e);

    // Middle-click or Space+left → pan
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      panState.current = { startX: sx, startY: sy, startVpX: vp.current.x, startVpY: vp.current.y };
      canvasRef.current!.style.cursor = "grabbing";
      return;
    }

    if (e.button !== 0) return;

    const [wx, wy] = screenToWorld(sx, sy);
    const hit = hitTest(wx, wy);
    if (hit) {
      setSelectedId(hit.id);
      dragState.current = { id: hit.id, worldOffsetX: wx - hit.x, worldOffsetY: wy - hit.y };
    } else {
      setSelectedId(null);
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const [sx, sy] = getCanvasXY(e);

    if (panState.current) {
      const { startX, startY, startVpX, startVpY } = panState.current;
      vp.current = { ...vp.current, x: startVpX + sx - startX, y: startVpY + sy - startY };
      return;
    }

    if (dragState.current) {
      const { id, worldOffsetX, worldOffsetY } = dragState.current;
      const [wx, wy] = screenToWorld(sx, sy);
      setElements(prev => prev.map(el => el.id === id
        ? { ...el, x: snapTo(wx - worldOffsetX), y: snapTo(wy - worldOffsetY) }
        : el));
      return;
    }

    const [wx, wy] = screenToWorld(sx, sy);
    const hit = hitTest(wx, wy);
    setHoveredId(hit ? hit.id : null);
    if (!spaceDown.current) {
      canvasRef.current!.style.cursor = hit ? "move" : "default";
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    if (panState.current) {
      panState.current = null;
      canvasRef.current!.style.cursor = spaceDown.current ? "grab" : "default";
    }
    dragState.current = null;
  }

  // ── Catalog drag ────────────────────────────────────────────────────────────
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

    // pixelsPerMetre at current zoom
    const ppm = pixelsPerMetreRef.current;
    const wPx = Math.max(4, item.w * ppm);
    const hPx = Math.max(4, item.h * ppm);

    const newEl: PlacedElement = {
      id: genId(), type: item.type,
      x: snapTo(wx - wPx / 2),
      y: snapTo(wy - hPx / 2),
      wPx, hPx, rotation: 0,
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
    draggingCatalogItem.current = null;
  }

  const selectedElement = elements.find(el => el.id === selectedId) ?? null;
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
          <span style={{ fontSize: 16 }}>←</span> Back
        </button>
        <div style={{ padding: "0 20px", flex: 1, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 16, fontStyle: "italic", color: "#2e3a1f" }}>Parcel Editor</span>
          <span style={{ color: "#2e3a1f33" }}>·</span>
          <span style={{ fontSize: 12, color: "#2e3a1f66", letterSpacing: "0.04em" }}>
            {elements.length} element{elements.length !== 1 ? "s" : ""}
          </span>
          <span style={{ color: "#2e3a1f33" }}>·</span>
          <span style={{ fontSize: 12, color: "#2e3a1f66", fontStyle: "italic" }}>
            {area.areaSqKm < 1 ? `${(area.areaSqKm * 100).toFixed(1)} ha` : `${area.areaSqKm.toFixed(1)} km²`}
          </span>
        </div>

        {/* Viewport controls */}
        <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 0, borderLeft: "1.5px solid #2e3a1f22", borderRight: "1.5px solid #2e3a1f22" }}>
          {/* Rotate CCW */}
          <button title="Rotate viewport −15° ( [ )" onClick={() => rotateViewport(-15 * Math.PI / 180)}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f88", fontSize: 14, fontFamily: "inherit" }}>
            ↺
          </button>
          {/* Zoom display + fit */}
          <button title="Fit parcel to screen ( F )" onClick={fitParcel}
            style={{ height: "100%", padding: "0 10px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.04em", minWidth: 52, textAlign: "center" }}>
            {zoomDisplay}%
          </button>
          {/* Rotate CW */}
          <button title="Rotate viewport +15° ( ] )" onClick={() => rotateViewport(15 * Math.PI / 180)}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f88", fontSize: 14, fontFamily: "inherit" }}>
            ↻
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          <button onClick={() => setElements([])} style={{ height: "100%", padding: "0 16px", background: "none", border: "none", borderRight: "1.5px solid #2e3a1f22", cursor: "pointer", color: "#2e3a1f77", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            Clear all
          </button>
          <button style={{ height: "100%", padding: "0 20px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            Export plan
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left sidebar */}
        <aside style={{ width: 220, flexShrink: 0, borderRight: "1.5px solid #2e3a1f22", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px", borderBottom: "1.5px solid #2e3a1f11" }}>
            <input value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} placeholder="Search elements…"
              style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #2e3a1f22", borderRadius: 3, background: "#2e3a1f08", fontSize: 12, fontFamily: "inherit", color: "#2e3a1f", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 10px", borderBottom: "1.5px solid #2e3a1f11" }}>
            <button onClick={() => setActiveCategory(null)}
              style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 3, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", borderColor: activeCategory === null ? "#2e3a1f" : "#2e3a1f33", background: activeCategory === null ? "#2e3a1f" : "transparent", color: activeCategory === null ? "#F4F5E0" : "#2e3a1f77" }}>
              All
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
              <div style={{ fontSize: 12, color: "#2e3a1f44", fontStyle: "italic", textAlign: "center", paddingTop: 20 }}>No elements found</div>
            )}
          </div>
          <div style={{ padding: "10px 12px", borderTop: "1.5px solid #2e3a1f11", fontSize: 10, color: "#2e3a1f44", lineHeight: 1.6 }}>
            Drag to place · Scroll to zoom · Middle-click or Space+drag to pan · [ ] to rotate view · F to fit
          </div>
        </aside>

        {/* Canvas area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}
          onDragOver={onCanvasDragOver} onDrop={onCanvasDrop} onDragLeave={() => setIsDragOver(false)}>
          {isDragOver && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, border: "3px dashed #2e3a1f66", background: "#2e3a1f08", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 14, color: "#2e3a1f88", fontStyle: "italic" }}>Drop to place</span>
            </div>
          )}
          <canvas ref={canvasRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
          {elements.length === 0 && !isDragOver && (
            <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
              <p style={{ fontSize: 12, color: "#2e3a1f55", fontStyle: "italic", whiteSpace: "nowrap" }}>
                Drag elements from the panel onto your parcel
              </p>
            </div>
          )}
        </div>

        {/* Right sidebar: inspector */}
        <aside style={{ width: 200, flexShrink: 0, borderLeft: "1.5px solid #2e3a1f22", overflowY: "auto" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #2e3a1f11", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88" }}>
            Inspector
          </div>
          <PropertiesPanel
            item={selectedElement}
            onChange={updated => setElements(prev => prev.map(el => el.id === updated.id ? updated : el))}
            onDelete={() => { setElements(prev => prev.filter(el => el.id !== selectedId)); setSelectedId(null); }}
          />
          {elements.length > 0 && (
            <div style={{ borderTop: "1.5px solid #2e3a1f11", marginTop: 8 }}>
              <div style={{ padding: "12px 16px 6px", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88" }}>
                Layers ({elements.length})
              </div>
              {[...elements].reverse().map(el => {
                const cat = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === el.type);
                return (
                  <div key={el.id} onClick={() => setSelectedId(el.id === selectedId ? null : el.id)}
                    style={{ padding: "7px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: el.id === selectedId ? "#2e3a1f0d" : "transparent", borderLeft: el.id === selectedId ? "2.5px solid #2e3a1f" : "2.5px solid transparent", transition: "all 0.1s" }}>
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

// ─── Mini map for results page ────────────────────────────────────────────────
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

// ─── Results page ─────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "overview", label: "Overview",       icon: "◈" },
  { id: "land",     label: "Land use",       icon: "⬡" },
  { id: "climate",  label: "Climate",        icon: "◌" },
  { id: "infra",    label: "Infrastructure", icon: "⊞" },
  { id: "export",   label: "Export",         icon: "↗" },
];

function ResultsPage({
  area,
  onBack,
  onOpenEditor,
}: {
  area: SelectedArea;
  onBack: () => void;
  onOpenEditor: () => void;
}) {
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
      {/* Top bar */}
      <header style={{
        borderBottom: "1.5px solid #2e3a1f22", background: "#F4F5E0",
        display: "flex", alignItems: "center", height: 56, flexShrink: 0,
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
          <span>Back to map</span>
        </button>

        <div style={{ flex: 1, padding: "0 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.12em", color: "#2e3a1f88", textTransform: "uppercase" }}>
            Selected area
          </span>
          <span style={{ color: "#2e3a1f44", fontSize: 11 }}>·</span>
          <span style={{ fontSize: 13, color: "#2e3a1f", fontStyle: "italic" }}>
            {areaSqKm < 1 ? `${(areaSqKm * 100).toFixed(1)} ha` : `${areaSqKm.toFixed(1)} km²`}
          </span>
          <span style={{ color: "#2e3a1f44", fontSize: 11 }}>·</span>
          <span style={{ fontSize: 13, color: "#2e3a1f99" }}>{points.length} vertices</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%", borderLeft: "1.5px solid #2e3a1f22" }}>
          {["Share", "Save"].map((label) => (
            <button
              key={label}
              style={{
                padding: "0 20px", height: "100%", background: "none", border: "none",
                borderRight: "1.5px solid #2e3a1f22", cursor: "pointer",
                color: "#2e3a1f99", fontSize: 13, fontFamily: "inherit", letterSpacing: "0.04em",
              }}
            >
              {label}
            </button>
          ))}
          {/* ← New: Open in Planner button */}
          <button
            onClick={onOpenEditor}
            style={{
              padding: "0 20px", height: "100%",
              background: "#2e3a1f", border: "none",
              cursor: "pointer", color: "#F4F5E0",
              fontSize: 13, fontFamily: "inherit", letterSpacing: "0.04em",
            }}
          >
            Open in planner →
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
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

        <main style={{ flex: 1, overflow: "auto", padding: "32px 40px" }}>
          {activeTab === "overview" && (
            <div style={{ maxWidth: 820 }}>
              <h1 style={{ fontSize: 28, fontWeight: 400, color: "#2e3a1f", marginBottom: 6, lineHeight: 1.2, fontStyle: "italic" }}>
                Custom area
              </h1>
              <p style={{ fontSize: 13, color: "#2e3a1f77", marginBottom: 36, letterSpacing: "0.04em" }}>
                Drawn on Czech Republic · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>

              <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
                <div style={{ width: 320, height: 220, flexShrink: 0, border: "1.5px solid #2e3a1f22", borderRadius: 4, overflow: "hidden" }}>
                  <MiniMap area={area} />
                </div>
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#2e3a1f18", border: "1.5px solid #2e3a1f22", borderRadius: 4, overflow: "hidden" }}>
                  {[
                    { label: "Total area", value: areaSqKm < 1 ? `${(areaSqKm * 100).toFixed(1)} ha` : `${areaSqKm.toFixed(1)} km²` },
                    { label: "Vertices",   value: points.length },
                    { label: "Width",      value: `~${widthKm} km` },
                    { label: "Height",     value: `~${heightKm} km` },
                    { label: "Centre lat", value: `${centerLat}° N` },
                    { label: "Centre lng", value: `${centerLng}° E` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "#F4F5E0", padding: "16px 20px" }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 20, color: "#2e3a1f", fontStyle: "italic" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {["Land cover summary", "Elevation profile", "Administrative units"].map((title) => (
                <div key={title} style={{ border: "1.5px solid #2e3a1f22", borderRadius: 4, marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1.5px solid #2e3a1f22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "#2e3a1f", letterSpacing: "0.04em" }}>{title}</span>
                    <span style={{ fontSize: 11, color: "#2e3a1f44", letterSpacing: "0.08em" }}>COMING SOON</span>
                  </div>
                  <div style={{
                    height: 80,
                    background: "repeating-linear-gradient(90deg, #2e3a1f08 0px, #2e3a1f08 1px, transparent 1px, transparent 32px), repeating-linear-gradient(0deg, #2e3a1f08 0px, #2e3a1f08 1px, transparent 1px, transparent 32px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "#2e3a1f33", fontStyle: "italic" }}>Data will appear here</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab !== "overview" && (
            <div style={{ maxWidth: 820 }}>
              <h1 style={{ fontSize: 28, fontWeight: 400, color: "#2e3a1f", marginBottom: 6, lineHeight: 1.2, fontStyle: "italic" }}>
                {NAV_ITEMS.find(n => n.id === activeTab)?.label}
              </h1>
              <p style={{ fontSize: 13, color: "#2e3a1f77", marginBottom: 36, letterSpacing: "0.04em" }}>
                This section is under construction.
              </p>
              <div style={{ border: "1.5px dashed #2e3a1f33", borderRadius: 4, padding: "60px 40px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>
                  {NAV_ITEMS.find(n => n.id === activeTab)?.icon}
                </div>
                <p style={{ fontSize: 14, color: "#2e3a1f55", fontStyle: "italic" }}>
                  {NAV_ITEMS.find(n => n.id === activeTab)?.label} data coming soon
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
          const dx = first.x - clicked.x, dy = first.y - clicked.y;
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
    setTimeout(() => { onAreaSelected(selectedArea); }, 600);
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

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<AppPage>("map");
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);

  function handleAreaSelected(area: SelectedArea) {
    setSelectedArea(area);
    setPage("results");
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapView onAreaSelected={handleAreaSelected} />

      {page === "results" && selectedArea && (
        <ResultsPage
          area={selectedArea}
          onBack={() => setPage("map")}
          onOpenEditor={() => setPage("editor")}
        />
      )}

      {page === "editor" && selectedArea && (
        <ParcelEditor
          area={selectedArea}
          onBack={() => setPage("results")}
        />
      )}
    </div>
  );
}