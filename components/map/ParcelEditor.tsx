"use client";

import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ITEMS, type Item } from "../encyclopedia/itemData";
import { formatAreaByMagnitude } from "./areaFormat";
import ClimateMap from "./ClimateMap";
import { ArrowLeft, ChevronDown, Maximize2, MoreVertical, Plus, Redo2, RotateCcw, RotateCw, Trash2, Undo2, X } from "lucide-react";

const StlPreview = dynamic(() => import("../StlPreview"), { ssr: false });


export interface SelectedArea {
  points: [number, number][];
  bounds: { north: number; south: number; east: number; west: number };
  areaSqKm: number;
}

export interface GeoElement {
  t: string;
  lat: number;
  lng: number;
  wM: number;
  hM: number;
  rot: number;
  note?: string;
}

interface SatelliteTile {
  z: number;
  x: number;
  y: number;
  img: HTMLImageElement;
}

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

interface Viewport {
  x: number;
  y: number;
  zoom: number;
  angle: number;
}

interface ParcelSavedState {
  elements: PlacedElement[];
  history: PlacedElement[][];
  historyIndex: number;
  vp: Viewport;
}

interface PlanStats {
  totalMin: number;
  totalMax: number;
  tempDelta: number;
  coveragePct: number;
  breakdown: { label: string; icon: string; count: number; min: number; max: number }[];
}


function parseDimensions(dim: string): { w: number; h: number } {
  const parts = dim
    .split(/[×x]/i)
    .map(part => part.replace(/[^\d,.-]/g, "").replace(",", ".").trim())
    .map(value => Number.parseFloat(value))
    .filter(value => Number.isFinite(value));
  return { w: parts[0] ?? 1, h: parts[1] ?? 1 };
}

function getItemCanvasDimensions(item: Item): { w: number; h: number } {
  if (item.dimensionsM) {
    return { w: item.dimensionsM.width, h: item.dimensionsM.depth };
  }
  return parseDimensions(item.dimensions);
}

function costToPrice(cost: Item["cost"]): { min: number; max: number } {
  if (cost === "low") return { min: 500, max: 2000 };
  if (cost === "medium") return { min: 2000, max: 8000 };
  return { min: 8000, max: 30000 };
}

function getItemPriceRange(item: Item): { min: number; max: number } {
  if (
    Number.isFinite(item.priceMin) &&
    Number.isFinite(item.priceMax) &&
    (item.priceMin as number) >= 0 &&
    (item.priceMax as number) >= (item.priceMin as number)
  ) {
    return { min: item.priceMin as number, max: item.priceMax as number };
  }
  return costToPrice(item.cost);
}

const ELEMENT_CATALOG = ITEMS.reduce<{ category: string; items: any[] }[]>((acc, item) => {
  const { w, h } = getItemCanvasDimensions(item);
  const entry = {
    type: item.id,
    label: item.name,
    icon: item.emoji,
    w,
    h,
    shape: "rect",
    color: "#4A7C59",
    desc: item.dimensions,
    itemRef: item,
  };
  const existing = acc.find(c => c.category === item.category);
  if (existing) existing.items.push(entry);
  else acc.push({ category: item.category, items: [entry] });
  return acc;
}, []);

const ELEMENT_PRICES: Record<string, { min: number; max: number }> = Object.fromEntries(
  ITEMS.map(item => [item.id, getItemPriceRange(item)])
);

const ELEMENT_COOLING: Record<string, number> = Object.fromEntries(
  ITEMS.map(item => [item.id, item.coolingEffect / 10])
);


function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}
function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * 2 ** z);
}
function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}
function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
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
  const scaleDeg = Math.min(drawW / bboxW, drawH / bboxH);
  const pixelsPerMetre = bboxWMetres > 0 ? (bboxW * scaleDeg) / bboxWMetres : 1;

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


function formatCZK(n: number): string {
  return n.toLocaleString("cs-CZ") + "\u00a0Kč";
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const SNAP = 5;
const HIT_PADDING_PX = 12;
function snapTo(v: number) { return Math.round(v / SNAP) * SNAP; }
function genId() { return Math.random().toString(36).slice(2, 9); }

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

function rectWithinPolygon(x: number, y: number, w: number, h: number, polygon: [number, number][]): boolean {
  const corners: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return corners.every(corner => pointInPolygon(corner, polygon));
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}


function computePlanStats(elements: PlacedElement[], parcelAreaSqM: number, pixelsPerMetre: number): PlanStats {
  const ppm2 = pixelsPerMetre * pixelsPerMetre;
  const byType: Record<string, { count: number; min: number; max: number; areaSqM: number }> = {};
  let totalMin = 0, totalMax = 0, totalCooling = 0, totalCoveredSqM = 0;

  elements.forEach(el => {
    const price = ELEMENT_PRICES[el.type] ?? { min: 0, max: 0 };
    const cooling = ELEMENT_COOLING[el.type] ?? 0;
    const areaSqM = (el.wPx * el.hPx) / ppm2;
    totalMin += price.min;
    totalMax += price.max;
    totalCooling += cooling * areaSqM;
    totalCoveredSqM += areaSqM;
    if (!byType[el.type]) byType[el.type] = { count: 0, min: 0, max: 0, areaSqM: 0 };
    byType[el.type].count++;
    byType[el.type].min += price.min;
    byType[el.type].max += price.max;
    byType[el.type].areaSqM += areaSqM;
  });

  const parcelArea = Math.max(parcelAreaSqM, 1);
  const tempDelta = Math.max(-(totalCooling / Math.sqrt(parcelArea)), -3.0);
  const coveragePct = Math.min(100, (totalCoveredSqM / parcelArea) * 100);

  const allItems = ELEMENT_CATALOG.flatMap(c => c.items);
  const breakdown = Object.entries(byType)
    .map(([type, data]) => {
      const cat = allItems.find(i => i.type === type);
      return { label: cat?.label ?? type, icon: cat?.icon ?? "?", ...data };
    })
    .sort((a, b) => b.max - a.max);

  return { totalMin, totalMax, tempDelta, coveragePct, breakdown };
}


function drawShape(
  ctx: CanvasRenderingContext2D,
  item: any,
  x: number, y: number, w: number, h: number,
  selected: boolean, hovered: boolean,
  topDownImage?: HTMLImageElement
) {
  const { shape, color } = item;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
  const hw = w / 2, hh = h / 2;
  const radius = Math.min(3, hw * 0.25, hh * 0.25);

  if (topDownImage && shape !== "circle" && shape !== "ellipse") {
    // Shadow/glow via opaque fill drawn first
    if (selected || hovered) {
      ctx.shadowColor = selected ? "#2e3a1f88" : "#2e3a1f33";
      ctx.shadowBlur = selected ? 12 : 6;
    }
    ctx.fillStyle = "#cccccc";
    ctx.beginPath();
    (ctx as any).roundRect(-hw, -hh, w, h, radius);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw image clipped to rounded rect
    ctx.save();
    ctx.beginPath();
    (ctx as any).roundRect(-hw, -hh, w, h, radius);
    ctx.clip();
    ctx.drawImage(topDownImage, -hw, -hh, w, h);
    ctx.restore();

    // Border
    ctx.strokeStyle = selected ? "#2e3a1f" : "#2e3a1f66";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    (ctx as any).roundRect(-hw, -hh, w, h, radius);
    ctx.stroke();
  } else {
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
      ctx.strokeStyle = color + "44"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, hw * 0.65, hh * 0.65, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      (ctx as any).roundRect(-hw, -hh, w, h, radius);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color + "44"; ctx.lineWidth = 1;
      const step = Math.max(15, Math.min(hw, hh) * 0.4);
      for (let ox = -hw + step; ox < hw; ox += step) {
        ctx.beginPath(); ctx.moveTo(ox, -hh + 4); ctx.lineTo(ox, hh - 4); ctx.stroke();
      }
    }

    const showLabel = !selected && !hovered;
    if (showLabel) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#2e3a1fcc";
      const fontSize = Math.max(5, Math.min(7, w / 10));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const maxW = Math.max(w - 4, fontSize * 3);
      let label = item.label;
      if (ctx.measureText(label).width > maxW) {
        while (label.length > 1 && ctx.measureText(label + "…").width > maxW) {
          label = label.slice(0, -1);
        }
        label += "…";
      }
      ctx.fillText(label, 0, 0);
    }
  }

  if (selected) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#2e3a1f";
    ctx.lineWidth = 2.5; ctx.setLineDash([]);
    ctx.strokeRect(-hw - 5, -hh - 5, w + 10, h + 10);
    const tick = 5, ox = hw + 7, oy = hh + 7;
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


function CostBadge({ cost }: { cost: Item["cost"] }) {
  const map = { low: { label: "Nízká cena", color: "#4A7C59" }, medium: { label: "Střední cena", color: "#8B7355" }, high: { label: "Vysoká cena", color: "#A0522D" } };
  const { label, color } = map[cost];
  return (
    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: color + "22", color, fontFamily: "inherit", letterSpacing: "0.04em" }}>
      {label}
    </span>
  );
}

function ItemTooltip({ item }: { item: Item }) {
  const price = getItemPriceRange(item);
  return (
    <div style={{
      width: 280, background: "#F4F5E0", border: "1.5px solid #2e3a1f33",
      borderRadius: 6, boxShadow: "0 4px 20px #2e3a1f22", padding: "14px 16px",
      maxHeight: "calc(100vh - 16px)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#4A7C5922", border: "1.5px solid #4A7C5966", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
          {item.emoji}
        </div>
        <div>
          <div style={{ fontSize: 13, color: "#2e3a1f", fontStyle: "italic", marginBottom: 2 }}>{item.name}</div>
          <div style={{ fontSize: 10, color: "#2e3a1f66", letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.category}</div>
        </div>
      </div>

      {item.modelPath && (
        <div
          style={{
            height: 150,
            marginBottom: 10,
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid #2e3a1f1a",
            background: "radial-gradient(circle at 50% 40%, #ffffff 0%, #eef2df 65%, #e4e9cf 100%)",
          }}
        >
          <StlPreview modelPath={item.modelPath} zoom={0.62} />
        </div>
      )}

      <p style={{ fontSize: 11, color: "#2e3a1f88", lineHeight: 1.55, marginBottom: 10, margin: "0 0 10px" }}>
        {item.description}
      </p>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        <CostBadge cost={item.cost} />
        {item.waterNeeded && (
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#5B7FA022", color: "#5B7FA0", fontFamily: "inherit", letterSpacing: "0.04em" }}>
            💧 Potřebuje vodu
          </span>
        )}
        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#2e3a1f0a", color: "#2e3a1f66", fontFamily: "inherit", letterSpacing: "0.04em" }}>
          Údržba: {item.maintenance === "low" ? "nízká" : item.maintenance === "medium" ? "střední" : "vysoká"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: 10 }}>
        {[
          { label: "Rozměry", value: item.dimensions },
          { label: "Životnost", value: item.lifespan },
          { label: "Chlazení", value: `−${item.coolingEffect} °C` },
          { label: "Hmotnost", value: item.weight },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f55", marginBottom: 1 }}>{label}</div>
            <div style={{ fontSize: 11, color: "#2e3a1f" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f55", marginBottom: 1 }}>Materiál</div>
        <div style={{ fontSize: 11, color: "#2e3a1f88" }}>{item.material}</div>
      </div>

      {Object.keys(item.specs).length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {Object.entries(item.specs).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#2e3a1f66" }}>{k}</span>
              <span style={{ color: "#2e3a1f" }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {item.tags.map(tag => (
          <span key={tag} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#2e3a1f0d", color: "#2e3a1f77", fontFamily: "inherit" }}>
            #{tag}
          </span>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #2e3a1f11", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f55" }}>Odhadovaná cena</span>
        <span style={{ fontSize: 12, color: "#2e3a1f", fontStyle: "italic" }}>{formatCZK(price.min)} – {formatCZK(price.max)}</span>
      </div>
    </div>
  );
}


function CatalogItem({ item, onDragStart }: { item: any; onDragStart: (e: React.DragEvent, item: any) => void }) {
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const p = ELEMENT_PRICES[item.type];
  const priceLabel = p
    ? `${p.min >= 1000 ? `${(p.min / 1000).toFixed(p.min % 1000 === 0 ? 0 : 1)}k` : p.min}–${p.max >= 1000 ? `${(p.max / 1000).toFixed(p.max % 1000 === 0 ? 0 : 1)}k` : p.max} Kč`
    : null;

  useEffect(() => {
    if (!hovered || !item.itemRef) {
      setTooltipPos(null);
      return;
    }

    function updateTooltipPos() {
      const rect = itemRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tooltipWidth = item.itemRef?.modelPath ? 280 : 240;
      const tooltipHeight = item.itemRef?.modelPath ? 520 : 380;
      const viewportPadding = 8;
      const gap = 8;
      const rightSpace = window.innerWidth - rect.right - viewportPadding;
      const leftSpace = rect.left - viewportPadding;
      const placeRight = rightSpace >= tooltipWidth || rightSpace >= leftSpace;
      const preferredLeft = placeRight ? rect.right + gap : rect.left - gap - tooltipWidth;
      const left = Math.max(
        viewportPadding,
        Math.min(preferredLeft, window.innerWidth - tooltipWidth - viewportPadding)
      );
      const top = Math.max(
        viewportPadding,
        Math.min(rect.top, window.innerHeight - tooltipHeight - viewportPadding)
      );
      setTooltipPos({ left, top });
    }

    updateTooltipPos();
    window.addEventListener("resize", updateTooltipPos);
    window.addEventListener("scroll", updateTooltipPos, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPos);
      window.removeEventListener("scroll", updateTooltipPos, true);
    };
  }, [hovered, item.itemRef]);

  return (
    <div ref={itemRef} style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div
        draggable
        onDragStart={e => onDragStart(e, item)}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          padding: "10px 6px", cursor: "grab",
          border: `1.5px solid ${hovered ? "#2e3a1f33" : "transparent"}`,
          borderRadius: 4, transition: "all 0.12s", userSelect: "none",
          background: hovered ? "#2e3a1f08" : "transparent",
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 4, background: item.color + "33", border: `1.5px solid ${item.color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
          {item.icon}
        </div>
        <span style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "#2e3a1f88", textAlign: "center", lineHeight: 1.2, maxWidth: 52, fontFamily: "inherit" }}>
          {item.label}
        </span>
        {priceLabel && (
          <span style={{ fontSize: 8, color: "#2e3a1f55", fontFamily: "inherit", textAlign: "center" }}>
            {priceLabel}
          </span>
        )}
      </div>
      {hovered && item.itemRef && tooltipPos && (
        <div
          style={{
            position: "fixed",
            left: tooltipPos.left,
            top: tooltipPos.top,
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <ItemTooltip item={item.itemRef} />
        </div>
      )}
    </div>
  );
}


function PropertiesPanel({ item, selectedCount, onChange, onCommit, onDelete }: {
  item: PlacedElement | null;
  selectedCount: number;
  onChange: (item: PlacedElement) => void;
  onCommit: (item: PlacedElement) => void;
  onDelete: () => void;
}) {
  if (!item) return (
    <div style={{ padding: "20px 16px", color: "#2e3a1f55", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
      {selectedCount > 1 ? "Vybráno více prvků" : "Vyberte prvek pro úpravu jeho vlastností"}
    </div>
  );
  const catalogItem = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === item.type);
  const price = ELEMENT_PRICES[item.type];
  const itemData: Item | undefined = (catalogItem as any)?.itemRef;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88", marginBottom: 12 }}>Vlastnosti</div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: "#2e3a1f", fontStyle: "italic", marginBottom: 2 }}>{catalogItem?.label}</div>
        <div style={{ fontSize: 11, color: "#2e3a1f55" }}>{catalogItem?.desc}</div>
        {price && (
          <div style={{ fontSize: 10, color: "#2e3a1f77", marginTop: 4 }}>
            {formatCZK(price.min)} – {formatCZK(price.max)}
          </div>
        )}
        {itemData && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#2e3a1f66", lineHeight: 1.5 }}>
            <div>Chlazení: <span style={{ color: "#2a7d4f" }}>−{itemData.coolingEffect} °C</span></div>
            <div>Životnost: {itemData.lifespan}</div>
            {itemData.waterNeeded && <div style={{ color: "#5B7FA0" }}>💧 Potřebuje zavlažování</div>}
          </div>
        )}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f77", marginBottom: 4 }}>Rotace (°)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={360} value={item.rotation || 0}
            onChange={e => onChange({ ...item, rotation: Number(e.target.value) })}
            onMouseUp={e => onCommit({ ...item, rotation: Number((e.target as HTMLInputElement).value) })}
            style={{ flex: 1, accentColor: "#2e3a1f" }} />
          <span style={{ fontSize: 11, color: "#2e3a1f", width: 32, textAlign: "right" }}>{item.rotation || 0}°</span>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f77", marginBottom: 4 }}>Poznámka</div>
        <textarea value={item.note || ""} onChange={e => onChange({ ...item, note: e.target.value })}
          onBlur={e => onCommit({ ...item, note: e.target.value })}
          placeholder="Přidat poznámku…" rows={2}
          style={{ width: "100%", resize: "none", background: "#2e3a1f08", border: "1.5px solid #2e3a1f22", borderRadius: 3, padding: "6px 8px", fontSize: 12, fontFamily: "inherit", color: "#2e3a1f", outline: "none", boxSizing: "border-box" }} />
      </div>
      <button onClick={onDelete}
        style={{ width: "100%", padding: "8px", background: "none", border: "1.5px solid #cc444422", borderRadius: 3, color: "#cc4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em", transition: "all 0.15s" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#cc444411"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
        Odebrat prvek
      </button>
    </div>
  );
}


function PlanSummaryBar({ stats, expanded, onToggle, area }: {
  stats: PlanStats | null;
  expanded: boolean;
  onToggle: () => void;
  area: SelectedArea;
}) {
  const hasElements = stats && stats.breakdown.length > 0;
  const tempColor = !stats || stats.tempDelta === 0 ? "#2e3a1f66"
    : stats.tempDelta < -1.5 ? "#2a7d4f"
    : stats.tempDelta < -0.5 ? "#5a9e72"
    : "#8ab89a";
  const tempLabel = !stats || stats.tempDelta === 0 ? "—" : `${stats.tempDelta.toFixed(1)} °C`;
  const coverLabel = stats ? `${stats.coveragePct.toFixed(0)}% pokryto` : "0% pokryto";

  return (
    <div style={{ flexShrink: 0, borderTop: "1.5px solid #2e3a1f22", background: "#F4F5E0", transition: "all 0.22s ease" }}>
      <div onClick={onToggle}
        style={{ height: 44, display: "flex", alignItems: "center", padding: "0 20px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 220 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f77" }}>Celkem</span>
          {hasElements
            ? <span style={{ fontSize: 14, color: "#2e3a1f", fontStyle: "italic" }}>{formatCZK(stats!.totalMin)} – {formatCZK(stats!.totalMax)}</span>
            : <span style={{ fontSize: 13, color: "#2e3a1f44", fontStyle: "italic" }}>žádné prvky</span>}
        </div>
        <div style={{ width: 1, height: 20, background: "#2e3a1f22", margin: "0 20px" }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 160 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f77" }}>Ochlazení</span>
          <span style={{ fontSize: 14, color: tempColor, fontStyle: "italic" }}>{hasElements ? tempLabel : "—"}</span>
        </div>
        <div style={{ width: 1, height: 20, background: "#2e3a1f22", margin: "0 20px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f77" }}>{coverLabel}</span>
          {hasElements && (
            <div style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 2, background: "#2e3a1f18", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: "#4A7C59", width: `${Math.min(100, stats!.coveragePct)}%`, transition: "width 0.3s ease" }} />
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: "#2e3a1f55", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4 }}>
          <span>{expanded ? "Skrýt" : "Podrobnosti"}</span>
          <ChevronDown size={12} style={{ display: "inline-block", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1.5px solid #2e3a1f11", padding: "12px 20px 16px", display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 8 }}>Rozpis nákladů</div>
            {!hasElements
              ? <div style={{ fontSize: 12, color: "#2e3a1f44", fontStyle: "italic" }}>Přetáhněte prvky na parcelu</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {stats!.breakdown.map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, width: 20, textAlign: "center" }}>{item.icon}</span>
                      <span style={{ fontSize: 11, color: "#2e3a1f", flex: 1 }}>{item.label}</span>
                      <span style={{ fontSize: 10, color: "#2e3a1f88", minWidth: 16, textAlign: "right" }}>×{item.count}</span>
                      <span style={{ fontSize: 11, color: "#2e3a1f66", minWidth: 140, textAlign: "right", fontStyle: "italic" }}>
                        {formatCZK(item.min)} – {formatCZK(item.max)}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #2e3a1f18", marginTop: 4, paddingTop: 6, display: "flex", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 12, color: "#2e3a1f", fontStyle: "italic", fontWeight: 500 }}>
                      {formatCZK(stats!.totalMin)} – {formatCZK(stats!.totalMax)}
                    </span>
                  </div>
                </div>
              )}
          </div>
          <div style={{ minWidth: 220, maxWidth: 320 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 8 }}>Vliv na mikroklima</div>
            {!hasElements
              ? <div style={{ fontSize: 12, color: "#2e3a1f44", fontStyle: "italic" }}>Přidejte prvky pro odhad</div>
              : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22, color: tempColor, fontStyle: "italic" }}>{tempLabel}</span>
                    <span style={{ fontSize: 11, color: "#2e3a1f66" }}>oproti nezasáhnuté parcele</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#2e3a1f77", lineHeight: 1.55 }}>
                    Odhad vychází z kombinace stínění, evapotranspirace rostlin a odpařování vodních prvků.
                  </div>
                </>
              )}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 8 }}>Klimatická mapa</div>
              <ClimateMap area={area} height={220} mode="czech" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function ParcelEditor({ areas, onBack, initialPlan }: { areas: SelectedArea[]; onBack: () => void; initialPlan?: GeoElement[] }) {
  const [activeParcelIdx, setActiveParcelIdx] = useState(0);
  const area = areas[activeParcelIdx];

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
  const [barExpanded, setBarExpanded] = useState(false);
  const [satTilesVersion, setSatTilesVersion] = useState(0);
  const [satImageStatus, setSatImageStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  const [mobileSheet, setMobileSheet] = useState<"none" | "catalog" | "summary" | "inspector" | "menu">("none");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const elementsRef = useRef(elements);
  const selectedIdsRef = useRef(selectedIds);
  const hoveredIdRef = useRef(hoveredId);
  const canvasSize = useRef({ w: 0, h: 0 });
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
    startWorldX: number; startWorldY: number;
    startPositions: Record<string, { x: number; y: number }>;
  } | null>(null);
  const marqueeState = useRef<{ startX: number; startY: number; additive: boolean } | null>(null);
  const spaceDown = useRef(false);

  // Touch / mobile gesture state
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startWorld: [number, number];
  } | null>(null);
  const touchTapRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const touchActiveRef = useRef(false);
  const touchClearTimeout = useRef<number | null>(null);

  const historyRef = useRef<PlacedElement[][]>([[]]);
  const historyIndexRef = useRef(0);
  const pendingInteractiveRef = useRef<PlacedElement[] | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const initialPlanRef = useRef<GeoElement[] | undefined>(initialPlan);
  const initialPlanApplied = useRef(false);
  const toastTimeoutRef = useRef<number | null>(null);
  const parcelSavedStatesRef = useRef<Map<number, ParcelSavedState>>(new Map());
  const prevParcelIdxRef = useRef(0);

  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);

  useEffect(() => {
    const allItems = ELEMENT_CATALOG.flatMap(c => c.items);
    for (const cat of allItems) {
      const imgPath: string | undefined = cat.itemRef?.topDownImagePath;
      if (imgPath && !imageCacheRef.current.has(cat.type)) {
        const img = new Image();
        img.src = imgPath;
        imageCacheRef.current.set(cat.type, img);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const prev = prevParcelIdxRef.current;
    if (prev === activeParcelIdx) return;

    // Save current parcel state before switching
    parcelSavedStatesRef.current.set(prev, {
      elements: [...elementsRef.current],
      history: historyRef.current.map(h => [...h]),
      historyIndex: historyIndexRef.current,
      vp: { ...vp.current },
    });

    // Load or initialise state for new parcel
    const saved = parcelSavedStatesRef.current.get(activeParcelIdx);
    const newElements = saved ? saved.elements : [];
    elementsRef.current = newElements;
    setElements(newElements);
    if (saved) {
      historyRef.current = saved.history;
      historyIndexRef.current = saved.historyIndex;
      vp.current = saved.vp;
      vpInitialised.current = true;
      setCanUndo(saved.historyIndex > 0);
      setCanRedo(saved.historyIndex < saved.history.length - 1);
    } else {
      historyRef.current = [[]];
      historyIndexRef.current = 0;
      vpInitialised.current = false;
      setCanUndo(false);
      setCanRedo(false);
    }
    setSelectedIds([]);
    setHoveredId(null);
    prevParcelIdxRef.current = activeParcelIdx;
  }, [activeParcelIdx]);


  useEffect(() => {
    if (editorMapStyle !== "satellite") { setSatImageStatus("idle"); return; }
    setSatImageStatus("loading");
    satelliteTilesRef.current = [];
    setSatTilesVersion(v => v + 1);

    const { north, south, east, west } = area.bounds;
    let zoom = 18;
    for (let z = 18; z >= 12; z--) {
      const count = (Math.abs(lngToTileX(east, z) - lngToTileX(west, z)) + 1)
                  * (Math.abs(latToTileY(south, z) - latToTileY(north, z)) + 1);
      if (count <= 36) { zoom = z; break; }
    }
    const x0 = Math.min(lngToTileX(west, zoom), lngToTileX(east, zoom));
    const x1 = Math.max(lngToTileX(west, zoom), lngToTileX(east, zoom));
    const y0 = Math.min(latToTileY(north, zoom), latToTileY(south, zoom));
    const y1 = Math.max(latToTileY(north, zoom), latToTileY(south, zoom));

    let cancelled = false;
    const loads: Promise<SatelliteTile | null>[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      loads.push(new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve({ z: zoom, x, y, img });
        img.onerror = () => resolve(null);
        img.src = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
      }));
    }
    Promise.all(loads).then(tiles => {
      if (cancelled) return;
      const loaded = tiles.filter((t): t is SatelliteTile => t !== null);
      satelliteTilesRef.current = loaded;
      setSatImageStatus(loaded.length > 0 ? "ready" : "error");
      setSatTilesVersion(v => v + 1);
    });
    return () => { cancelled = true; };
  }, [editorMapStyle, area.bounds.north, area.bounds.south, area.bounds.east, area.bounds.west]);


  function screenToWorld(sx: number, sy: number): [number, number] {
    const { x, y, zoom, angle } = vp.current;
    const dx = sx - x, dy = sy - y;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    return [(dx * cos - dy * sin) / zoom, (dx * sin + dy * cos) / zoom];
  }

  function worldToScreen(wx: number, wy: number): [number, number] {
    const { x, y, zoom, angle } = vp.current;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [wx * zoom * cos - wy * zoom * sin + x, wx * zoom * sin + wy * zoom * cos + y];
  }

  function fitParcel() {
    const { w, h } = canvasSize.current;
    const { project, pixelsPerMetre } = makeProjection(area.points, w, h, 80);
    const pts = area.points.map(project);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const pw = Math.max(...xs) - Math.min(...xs), ph = Math.max(...ys) - Math.min(...ys);
    const zoom = Math.min((w - 120) / pw, (h - 120) / ph, 4);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    vp.current = { x: w / 2 - cx * zoom, y: h / 2 - cy * zoom, zoom, angle: 0 };
    pixelsPerMetreRef.current = pixelsPerMetre;
    setZoomDisplay(Math.round(zoom * 100));
  }

  function showToast(message: string) {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }

  function drawEditorScene(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    options?: { selectedIds?: string[]; hoveredId?: string | null; showRotateHandle?: boolean }
  ) {
    const { x: vpX, y: vpY, zoom, angle } = vp.current;
    const isSat = editorMapStyle === "satellite";
    const hasTiles = isSat && satelliteTilesRef.current.length > 0;
    const selectedForRender = options?.selectedIds ?? selectedIdsRef.current;
    const hoveredForRender = options?.hoveredId ?? hoveredIdRef.current;
    const showRotateHandle = options?.showRotateHandle ?? true;

    const bgFill        = isSat ? "#5d6757" : "#d6d7c3";
    const bgGrid        = isSat ? "#ffffff14" : "#c8c9b544";
    const outsideFill   = isSat ? "#3f463bcc" : "#d6d7c3cc";
    const parcelFill    = isSat ? "#6f7d68" : "#F4F5E0";
    const fineGrid      = isSat ? "#ffffff10" : "#2e3a1f0d";
    const accentGrid    = isSat ? "#ffffff1f" : "#2e3a1f18";
    const parcelBorder  = isSat ? "#e8efda" : "#2e3a1f";
    const labelColor    = isSat ? "#f1f6e0bb" : "#2e3a1f55";
    const scaleColor    = isSat ? "#f1f6e0d0" : "#2e3a1f88";

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgFill;
    ctx.fillRect(0, 0, w, h);

    const gridStep = 40;
    ctx.strokeStyle = bgGrid;
    ctx.lineWidth = 0.5;
    const gox = ((vpX % gridStep) + gridStep) % gridStep;
    const goy = ((vpY % gridStep) + gridStep) % gridStep;
    for (let gx = gox - gridStep; gx < w + gridStep; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = goy - gridStep; gy < h + gridStep; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
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

    if (hasTiles) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(worldPts[0][0], worldPts[0][1]);
      worldPts.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = 0.95;
      satelliteTilesRef.current.forEach(tile => {
        const nw = project([tileYToLat(tile.y, tile.z), tileXToLng(tile.x, tile.z)]);
        const se = project([tileYToLat(tile.y + 1, tile.z), tileXToLng(tile.x + 1, tile.z)]);
        ctx.drawImage(
          tile.img,
          Math.min(nw[0], se[0]),
          Math.min(nw[1], se[1]),
          Math.abs(se[0] - nw[0]),
          Math.abs(se[1] - nw[1])
        );
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
    const gw = pixelsPerMetre;
    const xs2 = worldPts.map(p => p[0]), ys2 = worldPts.map(p => p[1]);
    const wx0 = Math.floor(Math.min(...xs2) / gw) * gw;
    const wy0 = Math.floor(Math.min(...ys2) / gw) * gw;
    const wx1 = Math.ceil(Math.max(...xs2) / gw) * gw;
    const wy1 = Math.ceil(Math.max(...ys2) / gw) * gw;
    ctx.strokeStyle = fineGrid;
    ctx.lineWidth = 0.5 / zoom;
    for (let gx = wx0; gx <= wx1; gx += gw) {
      ctx.beginPath();
      ctx.moveTo(gx, wy0);
      ctx.lineTo(gx, wy1);
      ctx.stroke();
    }
    for (let gy = wy0; gy <= wy1; gy += gw) {
      ctx.beginPath();
      ctx.moveTo(wx0, gy);
      ctx.lineTo(wx1, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = accentGrid;
    ctx.lineWidth = 1 / zoom;
    for (let gx = wx0; gx <= wx1; gx += gw * 5) {
      ctx.beginPath();
      ctx.moveTo(gx, wy0);
      ctx.lineTo(gx, wy1);
      ctx.stroke();
    }
    for (let gy = wy0; gy <= wy1; gy += gw * 5) {
      ctx.beginPath();
      ctx.moveTo(wx0, gy);
      ctx.lineTo(wx1, gy);
      ctx.stroke();
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

    if (isSat && !hasTiles) {
      const cx = worldPts.reduce((s, p) => s + p[0], 0) / worldPts.length;
      const cy = worldPts.reduce((s, p) => s + p[1], 0) / worldPts.length;
      ctx.save();
      ctx.fillStyle = "#f1f6e0dd";
      ctx.font = `${12 / zoom}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(satImageStatus === "error" ? "Satelitní snímky nejsou dostupné" : "Načítám satelitní snímky…", cx, cy);
      ctx.restore();
    }

    ctx.save();
    ctx.font = `${11 / zoom}px sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      formatAreaByMagnitude(area.areaSqKm),
      worldPts[0][0] + 8 / zoom,
      worldPts[0][1] + 8 / zoom
    );
    ctx.restore();

    const barMetres = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(m => m * pixelsPerMetre >= 80 / zoom) ?? 1000;
    const barPx = barMetres * pixelsPerMetre;
    const bx = Math.min(...xs2) + 10 / zoom;
    const by = Math.max(...ys2) - 20 / zoom;
    ctx.strokeStyle = scaleColor;
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx, by - 4 / zoom);
    ctx.lineTo(bx, by + 4 / zoom);
    ctx.moveTo(bx + barPx, by - 4 / zoom);
    ctx.lineTo(bx + barPx, by + 4 / zoom);
    ctx.stroke();
    ctx.font = `${10 / zoom}px sans-serif`;
    ctx.fillStyle = scaleColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(barMetres >= 1000 ? `${barMetres / 1000}km` : `${barMetres}m`, bx + barPx / 2, by - 5 / zoom);

    elementsRef.current.forEach(el => {
      const cat = ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === el.type);
      if (!cat) return;
      const topDownImg = imageCacheRef.current.get(el.type);
      drawShape(
        ctx,
        { ...cat, rotation: el.rotation || 0 },
        el.x,
        el.y,
        el.wPx,
        el.hPx,
        selectedForRender.includes(el.id),
        el.id === hoveredForRender,
        topDownImg?.complete ? topDownImg : undefined
      );
    });

    ctx.restore();

    rotateHandleRef.current = null;
    if (showRotateHandle && selectedForRender.length === 1) {
      const selId = selectedForRender[0];
      const selEl = elementsRef.current.find(el => el.id === selId);
      if (selEl) {
        const cx = selEl.x + selEl.wPx / 2, cy = selEl.y + selEl.hPx / 2;
        const theta = ((selEl.rotation || 0) * Math.PI) / 180;
        const orbitDist = selEl.hPx / 2 + 28;
        const [hx, hy] = worldToScreen(cx + Math.sin(theta) * orbitDist, cy - Math.cos(theta) * orbitDist);
        const hr = 12;
        rotateHandleRef.current = { id: selId, x: hx, y: hy, radius: hr };
        const [cxs, cys] = worldToScreen(cx, cy);
        ctx.save();
        ctx.strokeStyle = "#2e3a1f66";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cxs, cys);
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
      if (!w || !h) { raf = requestAnimationFrame(render); return; }
      drawEditorScene(ctx, w, h);

      raf = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(raf);
  }, [area, editorMapStyle, satTilesVersion, satImageStatus, isMobile]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const prev = canvasSize.current;
        const { width, height } = entry.contentRect;

        if (prev.w > 0 && prev.h > 0 && (width !== prev.w || height !== prev.h)) {
          const oldP = makeProjection(area.points, prev.w, prev.h, 80);
          const newP = makeProjection(area.points, width, height, 80);
          setElements(els => els.map(el => {
            const tl = oldP.unproject([el.x, el.y]);
            const br = oldP.unproject([el.x + el.wPx, el.y + el.hPx]);
            const ntl = newP.project(tl), nbr = newP.project(br);
            return {
              ...el,
              x: Math.min(ntl[0], nbr[0]), y: Math.min(ntl[1], nbr[1]),
              wPx: Math.max(4, Math.abs(nbr[0] - ntl[0])),
              hPx: Math.max(4, Math.abs(nbr[1] - ntl[1])),
            };
          }));
        }

        if (vpInitialised.current && prev.w > 0 && prev.h > 0) {
          const [cwx, cwy] = screenToWorld(prev.w / 2, prev.h / 2);
          const { zoom, angle } = vp.current;
          const c = Math.cos(angle), s = Math.sin(angle);
          vp.current = {
            ...vp.current,
            x: width / 2 - (cwx * zoom * c - cwy * zoom * s),
            y: height / 2 - (cwx * zoom * s + cwy * zoom * c),
          };
        }

        canvas.width = width; canvas.height = height;
        canvasSize.current = { w: width, h: height };
        if (!vpInitialised.current) {
          fitParcel();
          vpInitialised.current = true;
          if (initialPlanRef.current && !initialPlanApplied.current) {
            initialPlanApplied.current = true;
            const { project, pixelsPerMetre } = makeProjection(area.points, width, height, 80);
            const restoredElements: PlacedElement[] = initialPlanRef.current.map(ge => {
              const [px, py] = project([ge.lat, ge.lng]);
              const wPx = Math.max(4, ge.wM * pixelsPerMetre);
              const hPx = Math.max(4, ge.hM * pixelsPerMetre);
              return {
                id: genId(),
                type: ge.t,
                x: snapTo(px - wPx / 2),
                y: snapTo(py - hPx / 2),
                wPx,
                hPx,
                rotation: ge.rot,
                ...(ge.note ? { note: ge.note } : {}),
              };
            });
            setElements(restoredElements);
            pushHistory(restoredElements);
          }
        }
      }
    });
    obs.observe(canvas.parentElement);
    return () => obs.disconnect();
  }, [isMobile]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom (touchpad) or Ctrl+scroll (mouse)
        const [wx, wy] = screenToWorld(sx, sy);
        const { angle } = vp.current;
        const factor = Math.pow(0.99, e.deltaY);
        const newZoom = Math.max(0.05, Math.min(100, vp.current.zoom * factor));
        const c = Math.cos(angle), s = Math.sin(angle);
        vp.current = { ...vp.current, zoom: newZoom, x: sx - (wx * newZoom * c - wy * newZoom * s), y: sy - (wx * newZoom * s + wy * newZoom * c) };
        setZoomDisplay(Math.round(newZoom * 100));
      } else {
        vp.current = { ...vp.current, x: vp.current.x - e.deltaX, y: vp.current.y - e.deltaY };
      }
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [isMobile]);


  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      const inTextField = activeTag === "TEXTAREA" || activeTag === "INPUT";

      if (e.code === "Space" && !spaceDown.current) {
        spaceDown.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !inTextField) {
        if (selectedIdsRef.current.length > 0) {
          const s = new Set(selectedIdsRef.current);
          const newElements = elementsRef.current.filter(el => !s.has(el.id));
          setElements(newElements);
          pushHistory(newElements);
          setSelectedIds([]);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey && !inTextField) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey)) && !inTextField) {
        e.preventDefault();
        redo();
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

  function pushHistory(newElements: PlacedElement[]) {
    let newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push([...newElements]);
    if (newHistory.length > 50) newHistory = newHistory.slice(-50);
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    setElements([...historyRef.current[historyIndexRef.current]]);
    setSelectedIds([]);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    setElements([...historyRef.current[historyIndexRef.current]]);
    setSelectedIds([]);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }

  function rotateViewport(delta: number) {
    const { w, h } = canvasSize.current;
    const cx = w / 2, cy = h / 2;
    const { x, y, zoom, angle } = vp.current;
    const c = Math.cos(delta), s = Math.sin(delta);
    const dx = x - cx, dy = y - cy;
    vp.current = { zoom, angle: angle + delta, x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function normalizeDeg(d: number) { return ((d % 360) + 360) % 360; }
  function pointerAngleDeg(cx: number, cy: number, sx: number, sy: number) {
    return normalizeDeg((Math.atan2(sx - cx, -(sy - cy)) * 180) / Math.PI);
  }

  function startRotateDrag(id: string, sx: number, sy: number) {
    const el = elementsRef.current.find(i => i.id === id);
    if (!el) return;
    const [cx, cy] = worldToScreen(el.x + el.wPx / 2, el.y + el.hPx / 2);
    rotateDragRef.current = { id, angleOffsetDeg: pointerAngleDeg(cx, cy, sx, sy) - normalizeDeg(el.rotation || 0) };
    if (!spaceDown.current && canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }
  function stopRotateDrag() { rotateDragRef.current = null; }


  function hitTestScreen(sx: number, sy: number): PlacedElement | null {
    const ordered = [...elementsRef.current].reverse();
    for (const padding of [0, HIT_PADDING_PX]) {
      for (const el of ordered) {
        const corners: [number, number][] = [
          worldToScreen(el.x, el.y), worldToScreen(el.x + el.wPx, el.y),
          worldToScreen(el.x + el.wPx, el.y + el.hPx), worldToScreen(el.x, el.y + el.hPx),
        ];
        const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
        if (sx >= Math.min(...xs) - padding && sx <= Math.max(...xs) + padding &&
            sy >= Math.min(...ys) - padding && sy <= Math.max(...ys) + padding) {
          return el;
        }
      }
    }
    return null;
  }

  function hitTest(wx: number, wy: number): PlacedElement | null {
    for (const el of [...elementsRef.current].reverse()) {
      if (wx >= el.x && wx <= el.x + el.wPx && wy >= el.y && wy <= el.y + el.hPx) return el;
    }
    return null;
  }

  function getCanvasXY(e: React.MouseEvent | MouseEvent): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function canPlaceElementAt(
    x: number,
    y: number,
    wPx: number,
    hPx: number,
    ignoreIds: Set<string> = new Set()
  ): boolean {
    const { w, h } = canvasSize.current;
    if (!w || !h) return false;
    const { project } = makeProjection(area.points, w, h, 80);
    if (!rectWithinPolygon(x, y, wPx, hPx, area.points.map(project))) return false;

    const candidate = { x, y, w: wPx, h: hPx };
    for (const el of elementsRef.current) {
      if (ignoreIds.has(el.id)) continue;
      if (rectsOverlap(candidate, { x: el.x, y: el.y, w: el.wPx, h: el.hPx })) return false;
    }
    return true;
  }

  function getElementsInScreenRect(x0: number, y0: number, x1: number, y1: number): string[] {
    const [left, right, top, bottom] = [Math.min(x0,x1), Math.max(x0,x1), Math.min(y0,y1), Math.max(y0,y1)];
    return elementsRef.current.filter(el => {
      const corners: [number, number][] = [
        worldToScreen(el.x, el.y), worldToScreen(el.x + el.wPx, el.y),
        worldToScreen(el.x + el.wPx, el.y + el.hPx), worldToScreen(el.x, el.y + el.hPx),
      ];
      const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
      return !(Math.max(...xs) < left || Math.min(...xs) > right || Math.max(...ys) < top || Math.min(...ys) > bottom);
    }).map(el => el.id);
  }


  function onMouseDown(e: React.MouseEvent) {
    if (touchActiveRef.current) return;
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
      const dx = sx - handle.x, dy = sy - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= handle.radius + 2) { startRotateDrag(handle.id, sx, sy); return; }
    }

    const hit = hitTestScreen(sx, sy);
    if (hit) {
      if (e.shiftKey) {
        setSelectedIds(prev => prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id]);
        return;
      }
      const dragIds = selectedIdsRef.current.includes(hit.id) ? selectedIdsRef.current : [hit.id];
      if (!selectedIdsRef.current.includes(hit.id)) setSelectedIds([hit.id]);
      const [wx, wy] = screenToWorld(sx, sy);
      const startPositions: Record<string, { x: number; y: number }> = {};
      elementsRef.current.forEach(el => { if (dragIds.includes(el.id)) startPositions[el.id] = { x: el.x, y: el.y }; });
      dragState.current = {
        ids: dragIds,
        startWorldX: Math.max(hit.x, Math.min(wx, hit.x + hit.wPx)),
        startWorldY: Math.max(hit.y, Math.min(wy, hit.y + hit.hPx)),
        startPositions,
      };
    } else {
      marqueeState.current = { startX: sx, startY: sy, additive: e.shiftKey };
      setSelectionBox({ startX: sx, startY: sy, x: sx, y: sy });
      if (!e.shiftKey) setSelectedIds([]);
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (touchActiveRef.current) return;
    const [sx, sy] = getCanvasXY(e);

    if (panState.current) {
      const { startX, startY, startVpX, startVpY } = panState.current;
      vp.current = { ...vp.current, x: startVpX + sx - startX, y: startVpY + sy - startY };
      return;
    }

    if (rotateDragRef.current) {
      const { id, angleOffsetDeg } = rotateDragRef.current;
      const el = elementsRef.current.find(i => i.id === id);
      if (!el) { stopRotateDrag(); return; }
      const [cx, cy] = worldToScreen(el.x + el.wPx / 2, el.y + el.hPx / 2);
      const newRotation = normalizeDeg(pointerAngleDeg(cx, cy, sx, sy) - angleOffsetDeg);
      const newEls = elementsRef.current.map(i => i.id === id ? { ...i, rotation: newRotation } : i);
      pendingInteractiveRef.current = newEls;
      setElements(newEls);
      if (!spaceDown.current) canvasRef.current!.style.cursor = "grabbing";
      return;
    }

    if (dragState.current) {
      const { ids, startWorldX, startWorldY, startPositions } = dragState.current;
      const dragIdsSet = new Set(ids);
      const [wx, wy] = screenToWorld(sx, sy);
      const dx = wx - startWorldX, dy = wy - startWorldY;
      const nextById: Record<string, { x: number; y: number }> = {};
      const nextRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
      for (const id of ids) {
        const el = elementsRef.current.find(e => e.id === id);
        const sp = startPositions[id];
        if (!el || !sp) continue;
        const nx = snapTo(sp.x + dx), ny = snapTo(sp.y + dy);
        if (!canPlaceElementAt(nx, ny, el.wPx, el.hPx, dragIdsSet)) return;
        nextById[id] = { x: nx, y: ny };
        nextRects.push({ id, x: nx, y: ny, w: el.wPx, h: el.hPx });
      }

      for (let i = 0; i < nextRects.length; i++) {
        for (let j = i + 1; j < nextRects.length; j++) {
          if (rectsOverlap(nextRects[i], nextRects[j])) return;
        }
      }
      const newEls = elementsRef.current.map(el => { const n = nextById[el.id]; return n ? { ...el, ...n } : el; });
      pendingInteractiveRef.current = newEls;
      setElements(newEls);
      return;
    }

    if (marqueeState.current) {
      setSelectionBox(prev => prev ? { ...prev, x: sx, y: sy } : null);
      return;
    }

    const handle = rotateHandleRef.current;
    if (handle) {
      const dx = sx - handle.x, dy = sy - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= handle.radius + 2) {
        setHoveredId(null);
        if (!spaceDown.current) canvasRef.current!.style.cursor = "pointer";
        return;
      }
    }

    const [wx2, wy2] = screenToWorld(sx, sy);
    const hit = hitTestScreen(sx, sy) ?? hitTest(wx2, wy2);
    setHoveredId(hit ? hit.id : null);
    if (!spaceDown.current) canvasRef.current!.style.cursor = hit ? "move" : "default";
  }

  function onMouseUp(e: React.MouseEvent) {
    if (touchActiveRef.current) return;
    const [sx, sy] = getCanvasXY(e);
    if (panState.current) { panState.current = null; canvasRef.current!.style.cursor = spaceDown.current ? "grab" : "default"; }
    if ((dragState.current || rotateDragRef.current) && pendingInteractiveRef.current) {
      pushHistory(pendingInteractiveRef.current);
      pendingInteractiveRef.current = null;
    }
    stopRotateDrag();
    dragState.current = null;

    if (marqueeState.current) {
      const { startX, startY, additive } = marqueeState.current;
      if (Math.abs(sx - startX) >= 4 || Math.abs(sy - startY) >= 4) {
        const ids = getElementsInScreenRect(startX, startY, sx, sy);
        setSelectedIds(prev => additive ? Array.from(new Set([...prev, ...ids])) : ids);
      } else if (!additive) {
        setSelectedIds([]);
      }
    }
    marqueeState.current = null;
    setSelectionBox(null);
  }

  useEffect(() => {
    function onWindowMouseUp() {
      if ((dragState.current || rotateDragRef.current) && pendingInteractiveRef.current) {
        pushHistory(pendingInteractiveRef.current);
        pendingInteractiveRef.current = null;
      }
      stopRotateDrag();
      if (panState.current) { panState.current = null; if (canvasRef.current) canvasRef.current.style.cursor = spaceDown.current ? "grab" : "default"; }
      dragState.current = null;
    }
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);


  // ── Touch handlers (mobile) ───────────────────────────────────────────
  function getTouchXY(t: React.Touch | Touch): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect();
    return [t.clientX - r.left, t.clientY - r.top];
  }

  function commitInteractive() {
    if ((dragState.current || rotateDragRef.current) && pendingInteractiveRef.current) {
      pushHistory(pendingInteractiveRef.current);
      pendingInteractiveRef.current = null;
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    touchActiveRef.current = true;
    if (touchClearTimeout.current !== null) {
      window.clearTimeout(touchClearTimeout.current);
      touchClearTimeout.current = null;
    }

    if (e.touches.length === 2) {
      // Begin pinch-zoom / two-finger pan
      dragState.current = null;
      panState.current = null;
      stopRotateDrag();
      touchTapRef.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      const [ax, ay] = getTouchXY(a);
      const [bx, by] = getTouchXY(b);
      const cx = (ax + bx) / 2, cy = (ay + by) / 2;
      pinchRef.current = {
        startDist: Math.hypot(bx - ax, by - ay) || 1,
        startZoom: vp.current.zoom,
        startWorld: screenToWorld(cx, cy),
      };
      return;
    }

    if (e.touches.length !== 1) return;
    const [sx, sy] = getTouchXY(e.touches[0]);
    touchTapRef.current = { x: sx, y: sy, moved: false };

    const handle = rotateHandleRef.current;
    if (handle) {
      const dx = sx - handle.x, dy = sy - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= handle.radius + 14) {
        startRotateDrag(handle.id, sx, sy);
        return;
      }
    }

    const hit = hitTestScreen(sx, sy);
    if (hit) {
      const dragIds = selectedIdsRef.current.includes(hit.id) ? selectedIdsRef.current : [hit.id];
      if (!selectedIdsRef.current.includes(hit.id)) setSelectedIds([hit.id]);
      const [wx, wy] = screenToWorld(sx, sy);
      const startPositions: Record<string, { x: number; y: number }> = {};
      elementsRef.current.forEach(el => { if (dragIds.includes(el.id)) startPositions[el.id] = { x: el.x, y: el.y }; });
      dragState.current = {
        ids: dragIds,
        startWorldX: Math.max(hit.x, Math.min(wx, hit.x + hit.wPx)),
        startWorldY: Math.max(hit.y, Math.min(wy, hit.y + hit.hPx)),
        startPositions,
      };
    } else {
      // Empty space → pan (or tap to deselect, decided on touchend)
      panState.current = { startX: sx, startY: sy, startVpX: vp.current.x, startVpY: vp.current.y };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (pinchRef.current && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const [ax, ay] = getTouchXY(a);
      const [bx, by] = getTouchXY(b);
      const cx = (ax + bx) / 2, cy = (ay + by) / 2;
      const dist = Math.hypot(bx - ax, by - ay) || 1;
      const p = pinchRef.current;
      const newZoom = Math.max(0.05, Math.min(100, p.startZoom * (dist / p.startDist)));
      const { angle } = vp.current;
      const c = Math.cos(angle), s = Math.sin(angle);
      const [wx, wy] = p.startWorld;
      vp.current = {
        ...vp.current,
        zoom: newZoom,
        x: cx - (wx * newZoom * c - wy * newZoom * s),
        y: cy - (wx * newZoom * s + wy * newZoom * c),
      };
      setZoomDisplay(Math.round(newZoom * 100));
      return;
    }

    if (e.touches.length !== 1) return;
    const [sx, sy] = getTouchXY(e.touches[0]);
    if (touchTapRef.current && (Math.abs(sx - touchTapRef.current.x) > 6 || Math.abs(sy - touchTapRef.current.y) > 6)) {
      touchTapRef.current.moved = true;
    }

    if (rotateDragRef.current) {
      const { id, angleOffsetDeg } = rotateDragRef.current;
      const el = elementsRef.current.find(i => i.id === id);
      if (!el) { stopRotateDrag(); return; }
      const [cx, cy] = worldToScreen(el.x + el.wPx / 2, el.y + el.hPx / 2);
      const newRotation = normalizeDeg(pointerAngleDeg(cx, cy, sx, sy) - angleOffsetDeg);
      const newEls = elementsRef.current.map(i => i.id === id ? { ...i, rotation: newRotation } : i);
      pendingInteractiveRef.current = newEls;
      setElements(newEls);
      return;
    }

    if (dragState.current) {
      const { ids, startWorldX, startWorldY, startPositions } = dragState.current;
      const dragIdsSet = new Set(ids);
      const [wx, wy] = screenToWorld(sx, sy);
      const dx = wx - startWorldX, dy = wy - startWorldY;
      const nextById: Record<string, { x: number; y: number }> = {};
      const nextRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
      for (const id of ids) {
        const el = elementsRef.current.find(e2 => e2.id === id);
        const sp = startPositions[id];
        if (!el || !sp) continue;
        const nx = snapTo(sp.x + dx), ny = snapTo(sp.y + dy);
        if (!canPlaceElementAt(nx, ny, el.wPx, el.hPx, dragIdsSet)) return;
        nextById[id] = { x: nx, y: ny };
        nextRects.push({ id, x: nx, y: ny, w: el.wPx, h: el.hPx });
      }
      for (let i = 0; i < nextRects.length; i++) {
        for (let j = i + 1; j < nextRects.length; j++) {
          if (rectsOverlap(nextRects[i], nextRects[j])) return;
        }
      }
      const newEls = elementsRef.current.map(el => { const n = nextById[el.id]; return n ? { ...el, ...n } : el; });
      pendingInteractiveRef.current = newEls;
      setElements(newEls);
      return;
    }

    if (panState.current) {
      const { startX, startY, startVpX, startVpY } = panState.current;
      vp.current = { ...vp.current, x: startVpX + sx - startX, y: startVpY + sy - startY };
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length > 0) {
      // A finger lifted but others remain — end pinch, keep touch active
      pinchRef.current = null;
      return;
    }

    commitInteractive();

    const tap = touchTapRef.current;
    const wasInteracting = !!(dragState.current || rotateDragRef.current || pinchRef.current);
    if (tap && !tap.moved && !wasInteracting) {
      const hit = hitTestScreen(tap.x, tap.y);
      setSelectedIds(hit ? [hit.id] : []);
    }

    stopRotateDrag();
    dragState.current = null;
    panState.current = null;
    pinchRef.current = null;
    touchTapRef.current = null;

    // Keep mouse-event suppression briefly so synthesized clicks are ignored
    touchClearTimeout.current = window.setTimeout(() => {
      touchActiveRef.current = false;
      touchClearTimeout.current = null;
    }, 400);
  }

  // ── Tap-to-place (mobile catalog) ─────────────────────────────────────
  function findFreePlacement(wPx: number, hPx: number): { x: number; y: number } | null {
    const { w, h } = canvasSize.current;
    if (!w || !h) return null;
    const [cwx, cwy] = screenToWorld(w / 2, h / 2);
    const centre = { x: snapTo(cwx - wPx / 2), y: snapTo(cwy - hPx / 2) };
    if (canPlaceElementAt(centre.x, centre.y, wPx, hPx)) return centre;

    const { project } = makeProjection(area.points, w, h, 80);
    const pts = area.points.map(project);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const step = Math.max(SNAP, Math.min(wPx, hPx) / 2);
    for (let y = minY; y <= maxY - hPx; y += step) {
      for (let x = minX; x <= maxX - wPx; x += step) {
        const px = snapTo(x), py = snapTo(y);
        if (canPlaceElementAt(px, py, wPx, hPx)) return { x: px, y: py };
      }
    }
    return null;
  }

  function placeCatalogItem(item: any) {
    const ppm = pixelsPerMetreRef.current;
    const baseW = Math.max(0.0001, item.w * ppm), baseH = Math.max(0.0001, item.h * ppm);
    const scale = Math.max(6 / baseW, 6 / baseH, 1);
    const wPx = baseW * scale, hPx = baseH * scale;
    const pos = findFreePlacement(wPx, hPx);
    if (!pos) { showToast("Na parcele není volné místo"); return; }
    const newEl: PlacedElement = { id: genId(), type: item.type, x: pos.x, y: pos.y, wPx, hPx, rotation: 0 };
    const newElements = [...elementsRef.current, newEl];
    setElements(newElements);
    pushHistory(newElements);
    setSelectedIds([newEl.id]);
    showToast(`${item.label} přidán`);
  }

  function rotateSelectedBy(deltaDeg: number) {
    if (selectedIdsRef.current.length === 0) return;
    const ids = new Set(selectedIdsRef.current);
    const newEls = elementsRef.current.map(el => ids.has(el.id) ? { ...el, rotation: normalizeDeg((el.rotation || 0) + deltaDeg) } : el);
    setElements(newEls);
    pushHistory(newEls);
  }

  function deleteSelected() {
    const s = new Set(selectedIdsRef.current);
    if (s.size === 0) return;
    const newElements = elementsRef.current.filter(el => !s.has(el.id));
    setElements(newElements);
    pushHistory(newElements);
    setSelectedIds([]);
  }

  function onCatalogDragStart(e: React.DragEvent, item: any) {
    draggingCatalogItem.current = item;
    e.dataTransfer.effectAllowed = "copy";
  }

  function onCanvasDragOver(e: React.DragEvent) {
    e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDragOver(true);
  }

  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragOver(false);
    const item = draggingCatalogItem.current;
    if (!item) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const ppm = pixelsPerMetreRef.current;
    const baseW = Math.max(0.0001, item.w * ppm), baseH = Math.max(0.0001, item.h * ppm);
    const scale = Math.max(6 / baseW, 6 / baseH, 1);
    const wPx = baseW * scale, hPx = baseH * scale;
    const newEl: PlacedElement = { id: genId(), type: item.type, x: snapTo(wx - wPx / 2), y: snapTo(wy - hPx / 2), wPx, hPx, rotation: 0 };
    if (!canPlaceElementAt(newEl.x, newEl.y, newEl.wPx, newEl.hPx)) { draggingCatalogItem.current = null; return; }
    const newElements = [...elementsRef.current, newEl];
    setElements(newElements);
    pushHistory(newElements);
    setSelectedIds([newEl.id]);
    draggingCatalogItem.current = null;
  }


  const selectedElement = selectedIds.length === 1 ? (elements.find(el => el.id === selectedIds[0]) ?? null) : null;
  const categories = ELEMENT_CATALOG.map(c => c.category);
  const normalizedSidebarSearch = normalizeSearchText(sidebarSearch.trim());
  const filteredCatalog = ELEMENT_CATALOG
    .map((cat) => {
      const normalizedCategory = normalizeSearchText(cat.category);
      const items = cat.items.filter((item) => {
        if (activeCategory && cat.category !== activeCategory) return false;
        if (!normalizedSidebarSearch) return true;
        const normalizedLabel = normalizeSearchText(item.label);
        return (
          normalizedLabel.includes(normalizedSidebarSearch) ||
          normalizedCategory.includes(normalizedSidebarSearch)
        );
      });
      return { ...cat, items };
    })
    .filter(cat => cat.items.length > 0);

  const parcelAreaSqM = area.areaSqKm * 1_000_000;
  const planStats: PlanStats | null = elements.length === 0 ? null
    : computePlanStats(elements, parcelAreaSqM, pixelsPerMetreRef.current);

  function exportPlan() {
    const sourceCanvas = canvasRef.current;
    const { w, h } = canvasSize.current;
    if (!sourceCanvas || !w || !h) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = w;
    exportCanvas.height = h;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;

    drawEditorScene(exportCtx, w, h, { selectedIds: [], hoveredId: null, showRotateHandle: false });

    exportCanvas.toBlob(blob => {
      if (!blob) {
        showToast("Export PNG se nepodařil");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `plan-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("PNG export stažen");
    }, "image/png");
  }

  function sharePlan() {
    const { w, h } = canvasSize.current;
    if (!w || !h) return;

    const { unproject, pixelsPerMetre } = makeProjection(area.points, w, h, 80);

    const geoElements: GeoElement[] = elements.map(el => {
      const [lat, lng] = unproject([el.x + el.wPx / 2, el.y + el.hPx / 2]);
      return {
        t: el.type,
        lat: +lat.toFixed(7),
        lng: +lng.toFixed(7),
        wM: +(el.wPx / pixelsPerMetre).toFixed(3),
        hM: +(el.hPx / pixelsPerMetre).toFixed(3),
        rot: el.rotation || 0,
        ...(el.note ? { note: el.note } : {}),
      };
    });

    const payload = {
      v: 1,
      area: {
        points: area.points.map(([lat, lng]) => [+lat.toFixed(7), +lng.toFixed(7)]),
        bounds: {
          north: +area.bounds.north.toFixed(7),
          south: +area.bounds.south.toFixed(7),
          east: +area.bounds.east.toFixed(7),
          west: +area.bounds.west.toFixed(7),
        },
        areaSqKm: +area.areaSqKm.toFixed(8),
      },
      elements: geoElements,
    };

    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    const shareUrl = `${window.location.origin}${window.location.pathname}#plan=${b64}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast("Odkaz zkopírován do schránky");
    });
  }


  if (isMobile) {
    const tempColor = !planStats || planStats.tempDelta === 0 ? "#2e3a1f66"
      : planStats.tempDelta < -1.5 ? "#2a7d4f"
      : planStats.tempDelta < -0.5 ? "#5a9e72"
      : "#8ab89a";
    const tempLabel = !planStats || planStats.tempDelta === 0 ? "—" : `${planStats.tempDelta.toFixed(1)} °C`;
    const closeSheet = () => setMobileSheet("none");
    const sheetBase: React.CSSProperties = {
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30,
      background: "#F4F5E0", borderTop: "1.5px solid #2e3a1f22",
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      boxShadow: "0 -8px 30px #2e3a1f22", display: "flex", flexDirection: "column",
      animation: "fadeInUp 0.22s ease",
    };
    const sheetHandle = (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, flexShrink: 0 }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: "#2e3a1f33" }} />
      </div>
    );
    const iconBtn: React.CSSProperties = {
      width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
      background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontFamily: "inherit",
    };

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 4000, display: "flex", flexDirection: "column", background: "#F4F5E0", fontFamily: "'PT Sans', sans-serif", overflow: "hidden" }}>

        {/* Header */}
        <header style={{ height: 50, flexShrink: 0, borderBottom: "1.5px solid #2e3a1f22", display: "flex", alignItems: "center", paddingRight: 4 }}>
          <button onClick={onBack} style={{ ...iconBtn, width: 48 }}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span style={{ fontSize: 14, fontStyle: "italic", color: "#2e3a1f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {areas.length > 1 ? `Parcela ${activeParcelIdx + 1}` : "Editor parcely"}
            </span>
            <span style={{ fontSize: 10, color: "#2e3a1f66", letterSpacing: "0.03em" }}>
              {elements.length} {elements.length === 1 ? "prvek" : elements.length >= 2 && elements.length <= 4 ? "prvky" : "prvků"} · {formatAreaByMagnitude(area.areaSqKm)}
            </span>
          </div>
          <button onClick={undo} disabled={!canUndo} style={{ ...iconBtn, color: canUndo ? "#2e3a1f99" : "#2e3a1f28" }}><Undo2 size={17} /></button>
          <button onClick={redo} disabled={!canRedo} style={{ ...iconBtn, color: canRedo ? "#2e3a1f99" : "#2e3a1f28" }}><Redo2 size={17} /></button>
          <button onClick={() => setMobileSheet(s => s === "menu" ? "none" : "menu")} style={iconBtn}><MoreVertical size={18} /></button>
        </header>

        {/* Parcel tabs */}
        {areas.length > 1 && (
          <div style={{ height: 38, flexShrink: 0, borderBottom: "1.5px solid #2e3a1f22", display: "flex", alignItems: "stretch", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {areas.map((a, idx) => (
              <button key={idx} onClick={() => setActiveParcelIdx(idx)}
                style={{
                  padding: "0 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12, whiteSpace: "nowrap", flexShrink: 0,
                  color: activeParcelIdx === idx ? "#2e3a1f" : "#2e3a1f66",
                  borderBottom: activeParcelIdx === idx ? "2.5px solid #2e3a1f" : "2.5px solid transparent",
                }}>
                Parcela {idx + 1}
              </button>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <canvas ref={canvasRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} />

          {/* Zoom indicator */}
          <div style={{ position: "absolute", top: 10, right: 10, background: "#F4F5E0cc", border: "1.5px solid #2e3a1f22", borderRadius: 999, padding: "3px 10px", fontSize: 11, color: "#2e3a1f99", pointerEvents: "none" }}>
            {zoomDisplay}%
          </div>

          {elements.length === 0 && (
            <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", textAlign: "center", width: "90%" }}>
              <p style={{ fontSize: 12, color: "#2e3a1f66", fontStyle: "italic" }}>
                Klepněte na „Přidat" a vyberte prvky pro parcelu
              </p>
            </div>
          )}
        </div>

        {/* Selection toolbar */}
        {selectedIds.length > 0 && mobileSheet === "none" && (
          <div style={{ flexShrink: 0, borderTop: "1.5px solid #2e3a1f22", background: "#2e3a1f", display: "flex", alignItems: "center", height: 52, paddingLeft: 14 }}>
            <span style={{ fontSize: 12, color: "#F4F5E0cc", flex: 1, letterSpacing: "0.03em" }}>
              {selectedIds.length === 1 ? (ELEMENT_CATALOG.flatMap(c => c.items).find(i => i.type === selectedElement?.type)?.label ?? "Prvek") : `Vybráno: ${selectedIds.length}`}
            </span>
            <button onClick={() => rotateSelectedBy(-15)} style={{ ...iconBtn, color: "#F4F5E0" }}><RotateCcw size={18} /></button>
            <button onClick={() => rotateSelectedBy(15)} style={{ ...iconBtn, color: "#F4F5E0" }}><RotateCw size={18} /></button>
            {selectedIds.length === 1 && (
              <button onClick={() => setMobileSheet("inspector")} style={{ ...iconBtn, width: "auto", padding: "0 14px", fontSize: 12, color: "#F4F5E0" }}>Upravit</button>
            )}
            <button onClick={deleteSelected} style={{ ...iconBtn, color: "#ffb4b4" }}><Trash2 size={18} /></button>
          </div>
        )}

        {/* Bottom bar */}
        {!(selectedIds.length > 0 && mobileSheet === "none") && (
          <div style={{ flexShrink: 0, borderTop: "1.5px solid #2e3a1f22", background: "#F4F5E0", display: "flex", alignItems: "stretch", height: 60 }}>
            <button onClick={() => setMobileSheet(s => s === "summary" ? "none" : "summary")}
              style={{ flex: 1, background: "none", border: "none", borderRight: "1.5px solid #2e3a1f15", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "0 16px", gap: 2 }}>
              <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f77" }}>Celkem</span>
              <span style={{ fontSize: 13, fontStyle: "italic", color: "#2e3a1f" }}>
                {planStats ? `${formatCZK(planStats.totalMin)} – ${formatCZK(planStats.totalMax)}` : "žádné prvky"}
              </span>
            </button>
            <button onClick={() => setMobileSheet("catalog")}
              style={{ width: 130, flexShrink: 0, background: "#2e3a1f", color: "#F4F5E0", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, letterSpacing: "0.04em" }}>
              <Plus size={18} /> Přidat
            </button>
          </div>
        )}

        {/* Backdrop */}
        {mobileSheet !== "none" && (
          <div onClick={closeSheet} style={{ position: "absolute", inset: 0, background: "#2e3a1f44", zIndex: 25 }} />
        )}

        {/* Catalog sheet */}
        {mobileSheet === "catalog" && (
          <div style={{ ...sheetBase, height: "72%" }}>
            {sheetHandle}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 10px" }}>
              <input value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} placeholder="Hledat prvky…"
                style={{ flex: 1, padding: "10px 12px", border: "1.5px solid #2e3a1f22", borderRadius: 8, background: "#2e3a1f08", fontSize: 14, fontFamily: "inherit", color: "#2e3a1f", outline: "none" }} />
              <button onClick={closeSheet} style={iconBtn}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", overflowX: "auto", flexShrink: 0 }}>
              <button onClick={() => setActiveCategory(null)}
                style={{ flexShrink: 0, fontSize: 11, letterSpacing: "0.04em", padding: "6px 12px", borderRadius: 999, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", borderColor: activeCategory === null ? "#2e3a1f" : "#2e3a1f33", background: activeCategory === null ? "#2e3a1f" : "transparent", color: activeCategory === null ? "#F4F5E0" : "#2e3a1f88" }}>
                Vše
              </button>
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  style={{ flexShrink: 0, fontSize: 11, letterSpacing: "0.04em", padding: "6px 12px", borderRadius: 999, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", borderColor: activeCategory === cat ? "#2e3a1f" : "#2e3a1f33", background: activeCategory === cat ? "#2e3a1f" : "transparent", color: activeCategory === cat ? "#F4F5E0" : "#2e3a1f88" }}>
                  {cat}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 20px", WebkitOverflowScrolling: "touch" }}>
              {filteredCatalog.map(cat => (
                <div key={cat.category} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f55", marginBottom: 8 }}>{cat.category}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {cat.items.map(item => {
                      const p = ELEMENT_PRICES[item.type];
                      const priceLabel = p ? `${p.min >= 1000 ? `${(p.min / 1000).toFixed(p.min % 1000 === 0 ? 0 : 1)}k` : p.min}–${p.max >= 1000 ? `${(p.max / 1000).toFixed(p.max % 1000 === 0 ? 0 : 1)}k` : p.max}` : null;
                      return (
                        <button key={item.type} onClick={() => placeCatalogItem(item)}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 4px", border: "1.5px solid #2e3a1f18", borderRadius: 10, background: "#2e3a1f05", cursor: "pointer", fontFamily: "inherit" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 8, background: item.color + "33", border: `1.5px solid ${item.color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                            {item.icon}
                          </div>
                          <span style={{ fontSize: 9.5, letterSpacing: "0.03em", color: "#2e3a1f99", textAlign: "center", lineHeight: 1.2 }}>{item.label}</span>
                          {priceLabel && <span style={{ fontSize: 8.5, color: "#2e3a1f55" }}>{priceLabel} Kč</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredCatalog.length === 0 && (
                <div style={{ fontSize: 13, color: "#2e3a1f44", fontStyle: "italic", textAlign: "center", paddingTop: 30 }}>Nenalezeny žádné prvky</div>
              )}
            </div>
          </div>
        )}

        {/* Inspector sheet */}
        {mobileSheet === "inspector" && (
          <div style={{ ...sheetBase, maxHeight: "70%" }}>
            {sheetHandle}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 0 16px" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88" }}>Vlastnosti</span>
              <button onClick={closeSheet} style={iconBtn}><X size={20} /></button>
            </div>
            <div style={{ overflowY: "auto" }}>
              <PropertiesPanel
                item={selectedElement}
                selectedCount={selectedIds.length}
                onChange={updated => setElements(prev => prev.map(el => el.id === updated.id ? updated : el))}
                onCommit={updated => {
                  const newElements = elementsRef.current.map(el => el.id === updated.id ? updated : el);
                  pushHistory(newElements);
                }}
                onDelete={() => { deleteSelected(); closeSheet(); }}
              />
            </div>
          </div>
        )}

        {/* Summary sheet */}
        {mobileSheet === "summary" && (
          <div style={{ ...sheetBase, maxHeight: "78%" }}>
            {sheetHandle}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 8px 16px" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88" }}>Shrnutí plánu</span>
              <button onClick={closeSheet} style={iconBtn}><X size={20} /></button>
            </div>
            <div style={{ overflowY: "auto", padding: "0 16px 24px" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: "12px 14px", borderRadius: 10, background: "#2e3a1f08", border: "1.5px solid #2e3a1f12" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 4 }}>Celkem</div>
                  <div style={{ fontSize: 14, fontStyle: "italic", color: "#2e3a1f" }}>{planStats ? `${formatCZK(planStats.totalMin)} – ${formatCZK(planStats.totalMax)}` : "—"}</div>
                </div>
                <div style={{ width: 110, flexShrink: 0, padding: "12px 14px", borderRadius: 10, background: "#2e3a1f08", border: "1.5px solid #2e3a1f12" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 4 }}>Ochlazení</div>
                  <div style={{ fontSize: 14, fontStyle: "italic", color: tempColor }}>{tempLabel}</div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2e3a1f66" }}>Pokrytí</span>
                  <span style={{ fontSize: 11, color: "#2e3a1f99" }}>{planStats ? `${planStats.coveragePct.toFixed(0)}%` : "0%"}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#2e3a1f15", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: "#4A7C59", width: `${Math.min(100, planStats?.coveragePct ?? 0)}%`, transition: "width 0.3s ease" }} />
                </div>
              </div>

              <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 8 }}>Rozpis nákladů</div>
              {!planStats || planStats.breakdown.length === 0
                ? <div style={{ fontSize: 13, color: "#2e3a1f44", fontStyle: "italic", marginBottom: 16 }}>Zatím žádné prvky</div>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                    {planStats.breakdown.map(item => (
                      <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{item.icon}</span>
                        <span style={{ fontSize: 12, color: "#2e3a1f", flex: 1 }}>{item.label}</span>
                        <span style={{ fontSize: 11, color: "#2e3a1f88" }}>×{item.count}</span>
                        <span style={{ fontSize: 11, color: "#2e3a1f66", fontStyle: "italic", minWidth: 96, textAlign: "right" }}>{formatCZK(item.min)} – {formatCZK(item.max)}</span>
                      </div>
                    ))}
                  </div>
                )}

              <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f66", marginBottom: 8 }}>Klimatická mapa</div>
              <ClimateMap area={area} height={200} mode="czech" />
            </div>
          </div>
        )}

        {/* Menu sheet */}
        {mobileSheet === "menu" && (
          <div style={{ ...sheetBase }}>
            {sheetHandle}
            <div style={{ padding: "8px 0 16px" }}>
              <div style={{ display: "flex", gap: 8, padding: "8px 16px 12px" }}>
                {(["map", "satellite"] as const).map(style => (
                  <button key={style} onClick={() => setEditorMapStyle(style)}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #2e3a1f33", background: editorMapStyle === style ? "#2e3a1f" : "transparent", color: editorMapStyle === style ? "#F4F5E0" : "#2e3a1f99", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                    {style === "map" ? "Mapa" : "Satelit"}
                  </button>
                ))}
              </div>
              {([
                { label: "Přizpůsobit parcelu", icon: <Maximize2 size={18} />, onClick: () => { fitParcel(); closeSheet(); } },
                { label: "Otočit pohled o −15°", icon: <RotateCcw size={18} />, onClick: () => rotateViewport(-15 * Math.PI / 180) },
                { label: "Otočit pohled o +15°", icon: <RotateCw size={18} />, onClick: () => rotateViewport(15 * Math.PI / 180) },
                { label: "Exportovat plán (PNG)", icon: <Maximize2 size={18} />, onClick: () => { exportPlan(); closeSheet(); } },
                { label: "Sdílet odkaz", icon: <Plus size={18} />, onClick: () => { sharePlan(); closeSheet(); } },
                { label: "Vymazat vše", icon: <Trash2 size={18} />, danger: true, onClick: () => { setElements([]); setSelectedIds([]); pushHistory([]); closeSheet(); } },
              ] as const).map(row => (
                <button key={row.label} onClick={row.onClick}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", background: "none", border: "none", borderTop: "1px solid #2e3a1f0d", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: (row as any).danger ? "#cc4444" : "#2e3a1f", textAlign: "left" }}>
                  <span style={{ display: "flex", opacity: 0.75 }}>{row.icon}</span>
                  {row.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {toastMessage && (
          <div style={{
            position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
            background: "#2e3a1f", color: "#F4F5E0", padding: "10px 22px",
            borderRadius: 999, fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em",
            zIndex: 9999, pointerEvents: "none", animation: "fadeInUpCenter 0.2s ease", maxWidth: "85%", textAlign: "center",
          }}>
            {toastMessage}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 4000, display: "flex", flexDirection: "column", background: "#F4F5E0" }}>

      <header style={{ height: 52, flexShrink: 0, borderBottom: "1.5px solid #2e3a1f22", display: "flex", alignItems: "center", background: "#F4F5E0" }}>
        <button onClick={onBack}
          style={{ height: "100%", padding: "0 20px", borderRight: "1.5px solid #2e3a1f22", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 13, fontFamily: "inherit", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 8 }}>
          <ArrowLeft size={16} /> Zpět
        </button>
        <div style={{ padding: "0 20px", flex: 1, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 16, fontStyle: "italic", color: "#2e3a1f" }}>
            {areas.length > 1 ? `Parcela ${activeParcelIdx + 1}` : "Editor parcely"}
          </span>
          <span style={{ color: "#2e3a1f33" }}>·</span>
          <span style={{ fontSize: 12, color: "#2e3a1f66", letterSpacing: "0.04em" }}>
            {elements.length} {elements.length === 1 ? "prvek" : elements.length >= 2 && elements.length <= 4 ? "prvky" : "prvků"}
          </span>
          <span style={{ color: "#2e3a1f33" }}>·</span>
          <span style={{ fontSize: 12, color: "#2e3a1f66", fontStyle: "italic" }}>
            {formatAreaByMagnitude(area.areaSqKm)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%", borderLeft: "1.5px solid #2e3a1f22", borderRight: "1.5px solid #2e3a1f22" }}>
          <button title="Zpět (Ctrl+Z)" onClick={undo} disabled={!canUndo}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: canUndo ? "pointer" : "default", color: canUndo ? "#2e3a1f88" : "#2e3a1f28", display: "flex", alignItems: "center", fontFamily: "inherit" }}><Undo2 size={15} /></button>
          <button title="Znovu (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: canRedo ? "pointer" : "default", color: canRedo ? "#2e3a1f88" : "#2e3a1f28", display: "flex", alignItems: "center", fontFamily: "inherit" }}><Redo2 size={15} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%", borderRight: "1.5px solid #2e3a1f22" }}>
          <button title="Otočit pohled o −15° ( [ )" onClick={() => rotateViewport(-15 * Math.PI / 180)}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f88", display: "flex", alignItems: "center", fontFamily: "inherit" }}><RotateCcw size={15} /></button>
          <button title="Přizpůsobit parcelu na obrazovku ( F )" onClick={fitParcel}
            style={{ height: "100%", padding: "0 10px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.04em", minWidth: 52, textAlign: "center" }}>
            {zoomDisplay}%
          </button>
          <button title="Otočit pohled o +15° ( ] )" onClick={() => rotateViewport(15 * Math.PI / 180)}
            style={{ height: "100%", padding: "0 12px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f88", display: "flex", alignItems: "center", fontFamily: "inherit" }}><RotateCw size={15} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%", borderRight: "1.5px solid #2e3a1f22", padding: "0 8px", gap: 6 }}>
          {(["map", "satellite"] as const).map(style => (
            <button key={style} onClick={() => setEditorMapStyle(style)}
              style={{ padding: "4px 10px", borderRadius: 999, border: "1.5px solid #2e3a1f33", background: editorMapStyle === style ? "#2e3a1f" : "transparent", color: editorMapStyle === style ? "#F4F5E0" : "#2e3a1f88", fontSize: 11, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.04em" }}>
              {style === "map" ? "Mapa" : "Satelit"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          <button onClick={() => { setElements([]); setSelectedIds([]); pushHistory([]); }}
            style={{ height: "100%", padding: "0 16px", background: "none", border: "none", borderRight: "1.5px solid #2e3a1f22", cursor: "pointer", color: "#2e3a1f77", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            Vymazat vše
          </button>
          <button onClick={exportPlan} style={{ height: "100%", padding: "0 20px", background: "none", border: "none", borderRight: "1.5px solid #2e3a1f22", cursor: "pointer", color: "#2e3a1f", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            Exportovat plán
          </button>
          <button onClick={sharePlan} style={{ height: "100%", padding: "0 20px", background: "none", border: "none", cursor: "pointer", color: "#2e3a1f", fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em" }}>
            Sdílet
          </button>
        </div>
      </header>

      {areas.length > 1 && (
        <div style={{ height: 36, flexShrink: 0, borderBottom: "1.5px solid #2e3a1f22", display: "flex", alignItems: "center", background: "#F4F5E0", paddingLeft: 4 }}>
          {areas.map((a, idx) => (
            <button
              key={idx}
              onClick={() => setActiveParcelIdx(idx)}
              style={{
                height: "100%", padding: "0 16px",
                background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, letterSpacing: "0.06em",
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

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

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
          <div style={{ flex: 1, overflowY: "auto", padding: "8px", overflowX: "visible" }}>
            {filteredCatalog.map(cat => (
              <div key={cat.category} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2e3a1f55", marginBottom: 6, padding: "0 4px" }}>{cat.category}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, position: "relative" }}>
                  {cat.items.map(item => <CatalogItem key={item.type} item={item} onDragStart={onCatalogDragStart} />)}
                </div>
              </div>
            ))}
            {filteredCatalog.length === 0 && (
              <div style={{ fontSize: 12, color: "#2e3a1f44", fontStyle: "italic", textAlign: "center", paddingTop: 20 }}>Nenalezeny žádné prvky</div>
            )}
          </div>
          <div style={{ padding: "10px 12px", borderTop: "1.5px solid #2e3a1f11", fontSize: 10, color: "#2e3a1f44", lineHeight: 1.6 }}>
            Přetáhněte pro umístění · Shift+klik pro vícenásobný výběr · Tažením v prázdném prostoru vyberete oblast · Dvěma prsty posunete / kolečkem posunete · Ctrl+kolečko nebo pinch pro přiblížení · Mezerník+tažení pro posun · [ ] pro otočení pohledu · Ctrl+Z / Ctrl+Shift+Z pro zpět/znovu
          </div>
        </aside>

        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}
          onDragOver={onCanvasDragOver} onDrop={onCanvasDrop} onDragLeave={() => setIsDragOver(false)}>
          {isDragOver && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, border: "3px dashed #2e3a1f66", background: "#2e3a1f08", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 14, color: "#2e3a1f88", fontStyle: "italic" }}>Pusťte pro umístění</span>
            </div>
          )}
          <canvas ref={canvasRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} />
          {selectionBox && (
            <div style={{
              position: "absolute",
              left: Math.min(selectionBox.startX, selectionBox.x),
              top: Math.min(selectionBox.startY, selectionBox.y),
              width: Math.abs(selectionBox.x - selectionBox.startX),
              height: Math.abs(selectionBox.y - selectionBox.startY),
              border: "1.5px dashed #2e3a1faa", background: "#2e3a1f1a",
              pointerEvents: "none", zIndex: 8,
            }} />
          )}
          {elements.length === 0 && !isDragOver && (
            <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
              <p style={{ fontSize: 12, color: "#2e3a1f55", fontStyle: "italic", whiteSpace: "nowrap" }}>
                Přetáhněte prvky z panelu na parcelu
              </p>
            </div>
          )}
        </div>

        <aside style={{ width: 200, flexShrink: 0, borderLeft: "1.5px solid #2e3a1f22", overflowY: "auto" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #2e3a1f11", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2e3a1f88" }}>
            Inspektor
          </div>
          <PropertiesPanel
            item={selectedElement}
            selectedCount={selectedIds.length}
            onChange={updated => setElements(prev => prev.map(el => el.id === updated.id ? updated : el))}
            onCommit={updated => {
              const newElements = elementsRef.current.map(el => el.id === updated.id ? updated : el);
              pushHistory(newElements);
            }}
            onDelete={() => {
              const s = new Set(selectedIds);
              const newElements = elementsRef.current.filter(el => !s.has(el.id));
              setElements(newElements);
              pushHistory(newElements);
              setSelectedIds([]);
            }}
          />
          {selectedIds.length > 1 && (
            <div style={{ padding: "12px 16px", borderTop: "1.5px solid #2e3a1f11", color: "#2e3a1f77", fontSize: 11, lineHeight: 1.5 }}>
              Vybráno prvků: {selectedIds.length}
              <button
                onClick={() => {
                  const s = new Set(selectedIds);
                  const newElements = elementsRef.current.filter(el => !s.has(el.id));
                  setElements(newElements);
                  pushHistory(newElements);
                  setSelectedIds([]);
                }}
                style={{ width: "100%", marginTop: 8, padding: "8px", background: "none", border: "1.5px solid #cc444422", borderRadius: 3, color: "#cc4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" }}>
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
                const isSel = selectedIds.includes(el.id);
                return (
                  <div key={el.id}
                    onClick={e => {
                      if (e.shiftKey) { setSelectedIds(prev => prev.includes(el.id) ? prev.filter(id => id !== el.id) : [...prev, el.id]); return; }
                      setSelectedIds(isSel ? [] : [el.id]);
                    }}
                    style={{ padding: "7px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: isSel ? "#2e3a1f0d" : "transparent", borderLeft: isSel ? "2.5px solid #2e3a1f" : "2.5px solid transparent", transition: "all 0.1s" }}>
                    <span style={{ fontSize: 14 }}>{cat?.icon}</span>
                    <span style={{ fontSize: 11, color: "#2e3a1f", letterSpacing: "0.02em" }}>{cat?.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <PlanSummaryBar
        stats={planStats}
        expanded={barExpanded}
        onToggle={() => setBarExpanded(v => !v)}
        area={area}
      />

      {toastMessage && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "#2e3a1f", color: "#F4F5E0", padding: "10px 22px",
          borderRadius: 999, fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em",
          zIndex: 9999, pointerEvents: "none",
          animation: "fadeInUpCenter 0.2s ease",
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
