"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ITEMS, CATEGORIES, type Item, type Category } from "./itemData";

const COST_COLOR: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};
const BADGE = "text-xs font-medium px-2.5 py-1 rounded-full";
const COST_LABEL = { low: "Nízké", medium: "Střední", high: "Vysoké" } as const;
const MAINT_LABEL = { low: "Nízká", medium: "Střední", high: "Vysoká" } as const;

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function splitSearchTerms(value: string): string[] {
  const cleaned = normalizeSearchText(value).replace(/[^a-z0-9]+/g, " ").trim();
  if (!cleaned) return [];
  return [...new Set(cleaned.split(/\s+/).filter(Boolean))];
}

function toSearchSlug(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCostSearchAliases(cost: Item["cost"]): string[] {
  if (cost === "low") return ["low", "nizke", "nizky", "levne", "levny", "cheap"];
  if (cost === "medium") return ["medium", "stredni", "prumerne", "mid", "average"];
  return ["high", "vysoke", "vysoky", "drahe", "drahy", "expensive", "premium"];
}

function getMaintenanceSearchAliases(maintenance: Item["maintenance"]): string[] {
  if (maintenance === "low") return ["nizka", "nizke", "malo", "snadna", "easy", "minimalni"];
  if (maintenance === "medium") return ["stredni", "bezna", "normalni", "medium", "average"];
  return ["vysoka", "vysoke", "narocna", "high", "demanding"];
}

function getWaterSearchAliases(waterNeeded: boolean): string[] {
  if (waterNeeded) return ["voda", "zavlaha", "zalivka", "water", "watering"];
  return ["bez-vody", "bezvody", "bez vody", "sucho", "dry", "no-water"];
}

interface ItemSearchIndex {
  item: Item;
  name: string;
  description: string;
  category: string;
  material: string;
  dimensions: string;
  weight: string;
  tags: string[];
  specs: string[];
  aliases: string[];
}

function buildSearchIndex(item: Item): ItemSearchIndex {
  return {
    item,
    name: normalizeSearchText(item.name),
    description: normalizeSearchText(item.description),
    category: normalizeSearchText(item.category),
    material: normalizeSearchText(item.material),
    dimensions: normalizeSearchText(item.dimensions),
    weight: normalizeSearchText(item.weight),
    tags: item.tags.map((tag) => normalizeSearchText(tag)),
    specs: Object.entries(item.specs).map(([key, value]) => normalizeSearchText(`${key} ${value}`)),
    aliases: [
      ...getCostSearchAliases(item.cost),
      ...getMaintenanceSearchAliases(item.maintenance),
      ...getWaterSearchAliases(item.waterNeeded),
      normalizeSearchText(COST_LABEL[item.cost]),
      normalizeSearchText(MAINT_LABEL[item.maintenance]),
    ],
  };
}

function scoreSearchMatch(index: ItemSearchIndex, query: string, terms: string[]): number {
  let score = 0;

  for (const term of terms) {
    let matched = false;

    if (index.name.includes(term)) {
      score += index.name.startsWith(term) ? 55 : 42;
      matched = true;
    }
    if (index.tags.some((tag) => tag.includes(term))) {
      score += 30;
      matched = true;
    }
    if (index.category.includes(term)) {
      score += 24;
      matched = true;
    }
    if (index.material.includes(term)) {
      score += 20;
      matched = true;
    }
    if (index.aliases.some((alias) => alias.includes(term))) {
      score += 22;
      matched = true;
    }
    if (index.specs.some((spec) => spec.includes(term))) {
      score += 18;
      matched = true;
    }
    if (index.description.includes(term)) {
      score += 14;
      matched = true;
    }
    if (index.dimensions.includes(term) || index.weight.includes(term)) {
      score += 10;
      matched = true;
    }

    if (!matched) return -1;
  }

  if (index.name === query) score += 130;
  else if (index.name.startsWith(query)) score += 90;
  else if (index.name.includes(query)) score += 58;

  if (index.tags.some((tag) => tag.includes(query))) score += 40;
  if (index.category.includes(query)) score += 34;
  if (index.aliases.some((alias) => alias.includes(query))) score += 28;
  if (index.description.includes(query)) score += 20;

  return score;
}

function getSortComparator(sortBy: "name" | "cooling" | "cost"): (a: Item, b: Item) => number {
  if (sortBy === "cooling") {
    return (a, b) => b.coolingEffect - a.coolingEffect || a.name.localeCompare(b.name, "cs");
  }
  if (sortBy === "cost") {
    const order = { low: 0, medium: 1, high: 2 };
    return (a, b) => order[a.cost] - order[b.cost] || a.name.localeCompare(b.name, "cs");
  }
  return (a, b) => a.name.localeCompare(b.name, "cs");
}

const ITEM_SEARCH_INDEX = ITEMS.map(buildSearchIndex);

function formatCZK(value: number): string {
  return `${value.toLocaleString("cs-CZ")} Kč`;
}

function getItemPriceLabel(item: Item): string {
  if (
    Number.isFinite(item.priceMin) &&
    Number.isFinite(item.priceMax) &&
    (item.priceMin as number) >= 0 &&
    (item.priceMax as number) >= (item.priceMin as number)
  ) {
    return `${formatCZK(item.priceMin as number)} – ${formatCZK(item.priceMax as number)}`;
  }
  return COST_LABEL[item.cost];
}

function CoolingBar({ value }: { value: number }) {
  const pct = Math.min(100, (value / 8) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-btn/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-btn-dark transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-btn-dark tabular-nums w-12 text-right">
        −{value}°C
      </span>
    </div>
  );
}

function ItemCard({ item, onClick }: { item: Item; onClick: () => void }) {
  const priceLabel = getItemPriceLabel(item);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-bg border border-btn/30 rounded-2xl p-5 hover:border-btn hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl leading-none">{item.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg text-text leading-tight group-hover:text-btn-dark transition-colors">
            {item.name}
          </h3>
          <p className="text-xs text-text-light mt-0.5">{item.category}</p>
        </div>
      </div>

      <p className="text-sm text-text-mid leading-relaxed mb-4 line-clamp-2">
        {item.description}
      </p>

      <CoolingBar value={item.coolingEffect} />

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className={`${BADGE} ${COST_COLOR[item.cost]}`}>
          {item.cost === "low" ? "💚" : item.cost === "medium" ? "🟡" : "🔴"} Cena: {priceLabel}
        </span>
        <span className={`${BADGE} bg-fg text-text-mid`}>
          🔧 Údržba: {MAINT_LABEL[item.maintenance]}
        </span>
        {!item.waterNeeded && (
          <span className={`${BADGE} bg-fg text-text-mid`}>💧 Bez potřeby vody</span>
        )}
      </div>
    </button>
  );
}

function DetailPanel({ item, onClose }: { item: Item; onClose: () => void }) {
  const priceLabel = getItemPriceLabel(item);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-8">
      <div
        className="absolute inset-0 bg-text/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-bg rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-bg/95 backdrop-blur-md border-b border-btn/20 px-6 py-4 flex items-center gap-3 rounded-t-3xl">
          <span className="text-4xl">{item.emoji}</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-2xl text-text leading-tight">{item.name}</h2>
            <p className="text-sm text-text-light">{item.category}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-fg border border-btn/30 flex items-center justify-center text-text-mid hover:bg-btn/30 transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-text-mid leading-relaxed">{item.description}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Chladicí efekt", value: `−${item.coolingEffect}°C` },
              { label: "Životnost", value: item.lifespan },
              { label: "Cena", value: priceLabel },
              { label: "Údržba", value: MAINT_LABEL[item.maintenance] },
            ].map(({ label, value }) => (
              <div key={label} className="bg-fg border border-btn/20 rounded-xl p-3 text-center">
                <p className="text-xs text-text-light uppercase tracking-wide mb-1">{label}</p>
                <p className="font-display text-lg text-text">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-text-light mb-2">Chladicí potenciál (max 8 °C)</p>
            <CoolingBar value={item.coolingEffect} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Materiál", value: item.material },
              { label: "Hmotnost", value: item.weight },
              { label: "Rozměry", value: item.dimensions },
              { label: "Potřeba vody", value: item.waterNeeded ? "Ano" : "Ne" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start py-2.5 px-3 rounded-xl bg-fg/60 border border-btn/15">
                <span className="text-xs text-text-light">{label}</span>
                <span className="text-xs font-medium text-text text-right max-w-[55%]">{value}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-text-light mb-3">Technické specifikace</p>
            <div className="rounded-xl border border-btn/20 overflow-hidden">
              {Object.entries(item.specs).map(([key, val], i, arr) => (
                <div
                  key={key}
                  className={`flex justify-between items-center px-4 py-2.5 text-sm ${
                    i % 2 === 0 ? "bg-fg/40" : "bg-bg"
                  } ${i !== arr.length - 1 ? "border-b border-btn/10" : ""}`}
                >
                  <span className="text-text-mid">{key}</span>
                  <span className="font-medium text-text">{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span key={tag} className={`${BADGE} bg-btn/20 text-text-mid`}>
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EncyclopediaView() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "Vše">("Vše");
  const [sortBy, setSortBy] = useState<"name" | "cooling" | "cost">("name");
  const [selected, setSelected] = useState<Item | null>(null);
  const initialOpenApplied = useRef(false);

  useEffect(() => {
    if (initialOpenApplied.current) return;
    initialOpenApplied.current = true;

    const openParam = searchParams.get("open")?.trim();
    if (!openParam) return;

    const normalizedOpen = normalizeSearchText(openParam);
    const requestedSlug = toSearchSlug(openParam);
    const toOpen = ITEMS.find((item) => {
      if (item.id === openParam) return true;
      if (normalizeSearchText(item.name) === normalizedOpen) return true;
      return toSearchSlug(item.name) === requestedSlug;
    });

    if (toOpen) setSelected(toOpen);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const comparator = getSortComparator(sortBy);
    let items = ITEM_SEARCH_INDEX;

    if (activeCategory !== "Vše") {
      items = items.filter((entry) => entry.item.category === activeCategory);
    }

    const query = normalizeSearchText(search.trim());
    const terms = splitSearchTerms(query);

    if (terms.length === 0) {
      return items.map((entry) => entry.item).sort(comparator);
    }

    return items
      .map((entry) => ({
        item: entry.item,
        score: scoreSearchMatch(entry, query, terms),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || comparator(a.item, b.item))
      .map((entry) => entry.item);
  }, [search, activeCategory, sortBy]);

  return (
    <div className="min-h-screen bg-fg/40">

      <div className="bg-bg border-b border-btn/30">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <p className="text-xs uppercase tracking-widest text-text-light mb-2">Referenční knihovna</p>
          <h1 className="font-display text-4xl md:text-5xl text-text mb-2">
            Prvky pro ochlazení města
          </h1>
          <p className="text-text-mid max-w-lg">
            Všechny květináče, nádoby, povrchy a prvky pro zásahy do městských náměstí s kompletními specifikacemi a daty o ochlazení.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-light text-sm">🔍</span>
            <input
              type="text"
              placeholder="Hledat název, štítky, materiál, specifikace…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-bg border border-btn/40 rounded-full text-sm text-text placeholder-text-light focus:outline-none focus:border-btn focus:ring-2 focus:ring-btn/20"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="bg-bg border border-btn/40 rounded-full px-4 py-2.5 text-sm text-text focus:outline-none focus:border-btn cursor-pointer"
          >
            <option value="name">Řazení: A–Z</option>
            <option value="cooling">Řazení: Nejlepší ochlazení</option>
            <option value="cost">Řazení: Nejnižší cena</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {(["Vše", ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat
                  ? "bg-text text-bg shadow-sm"
                  : "bg-bg border border-btn/40 text-text-mid hover:border-btn hover:text-text"
              }`}
            >
              {cat}
              <span className="ml-1.5 text-xs opacity-60">
                {cat === "Vše" ? ITEMS.length : ITEMS.filter((i) => i.category === cat).length}
              </span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-text-light">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-display text-xl">Žádné prvky neodpovídají vyhledávání</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <ItemCard key={item.id} item={item} onClick={() => setSelected(item)} />
            ))}
          </div>
        )}

        <p className="text-xs text-text-light text-center mt-8">
          {filtered.length} z {ITEMS.length} prvků
        </p>
      </div>

      {selected && (
        <DetailPanel item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
