export type Category = "Květináče" | "Nádoby" | "Půdní pokryv" | "Vodní prvky" | "Posezení";

export interface ItemDimensions {
  width: number;
  depth: number;
  height?: number;
}

export function formatDimensions(dimensions: ItemDimensions): string {
  const parts = [dimensions.width, dimensions.depth, dimensions.height].filter(
    (value): value is number => typeof value === "number"
  );
  return `${parts
    .map(value => value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 }))
    .join(" × ")} m`;
}

export interface Item {
  id: string;
  name: string;
  category: Category;
  emoji: string;
  description: string;
  coolingEffect: number;
  cost: "low" | "medium" | "high";
  priceMin?: number;
  priceMax?: number;
  maintenance: "low" | "medium" | "high";
  lifespan: string;       
  material: string;
  weight: string;
  dimensions: string;
  modelPath?: string;
  dimensionsM?: ItemDimensions;
  waterNeeded: boolean;
  tags: string[];
  specs: Record<string, string>;
}

const rostlinnaBranaDimensions: ItemDimensions = {
  width: 4.6,
  depth: 2,
  height: 3,
};
const rostlinnaStenaDimensions: ItemDimensions = {
  width: 1.8,
  depth: 2,
  height: 3,
};
const rostlinnaBranaModelPath = encodeURI("/Rostliná brána.stl");
const rostlinnaStenaModelPath = encodeURI("/Rostliná stěna.stl");

export const ITEMS: Item[] = [
  {
    id: "1",
    name: "Rostlinná brána",
    category: "Květináče",
    emoji: "🪴",
    description: "Rostlinná brána, která vytvoří velkou zastíněnou plochu.",
    coolingEffect: 6, 
    cost: "high",
    priceMin: 90000,
    priceMax: 105000,
    maintenance: "low",
    lifespan: "10–15 let",
    material: "Dřevo, hliník, nerezová ocel",
    weight: "5 000 kg (s půdou a plně zavlažené)",
    dimensions: formatDimensions(rostlinnaBranaDimensions),
    modelPath: rostlinnaBranaModelPath,
    dimensionsM: rostlinnaBranaDimensions,
    waterNeeded: true,
    tags: ["modulární", "brána", "venkovní"],
    specs: {
      "Barva": "Šedo-hnědá",
    },
  },
    {
    id: "2",
    name: "Rostlinná stěna",
    category: "Květináče",
    emoji: "🪴",
    description: "Rostlinná stěna, která vytvoří příjemné zastíněné prostředí.",
    coolingEffect: 6, 
    cost: "medium",
    priceMin: 45000,
    priceMax: 55000,
    maintenance: "low",
    lifespan: "10–15 let",
    material: "Dřevo, hliník, nerezová ocel",
    weight: "2 500 kg (s půdou a plně zavlažené)",
    dimensions: formatDimensions(rostlinnaStenaDimensions),
    modelPath: rostlinnaStenaModelPath,
    dimensionsM: rostlinnaStenaDimensions,
    waterNeeded: true,
    tags: ["modulární", "stěna", "venkovní"],
    specs: {
      "Barva": "Šedo-hnědá",
    },
  },
];

export const CATEGORIES: Category[] = ["Květináče", "Nádoby", "Půdní pokryv", "Vodní prvky", "Posezení"];

export const COST_LABEL: Record<string, string> = { low: "Nízké", medium: "Střední", high: "Vysoké" };
export const MAINT_LABEL: Record<string, string> = { low: "Nízká", medium: "Střední", high: "Vysoká" };
