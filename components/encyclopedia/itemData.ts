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
  topDownImagePath?: string;
  dimensionsM?: ItemDimensions;
  waterFrequency?: string;
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
const zastineneParkovaciMistoDimensions: ItemDimensions = {
  width: 2,
  depth: 3,
  height: 5,
};
const rostlinnaBranaModelPath = encodeURI("/Rostliná brána.stl");
const rostlinnaStenaModelPath = encodeURI("/Rostliná stěna.stl");
const rostlinnaBranaTopImagePath = encodeURI("/Rostliná brána-top.png");
const rostlinnaStenaTopImagePath = encodeURI("/Rostliná stěna-top.png");

export const ITEMS: Item[] = [
  {
    id: "1",
    name: "Rostlinná brána",
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
    topDownImagePath: rostlinnaBranaTopImagePath,
    dimensionsM: rostlinnaBranaDimensions,
    waterFrequency: "1x měsíčně (bez srážek)",
    tags: ["modulární", "brána", "venkovní"],
    specs: {
      "Barva": "Šedo-hnědá",
    },
  },
    {
    id: "2",
    name: "Rostlinná stěna",
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
    topDownImagePath: rostlinnaStenaTopImagePath,
    dimensionsM: rostlinnaStenaDimensions,
    waterFrequency: "1x měsíčně (bez srážek)",
    tags: ["modulární", "stěna", "venkovní"],
    specs: {
      "Barva": "Šedo-hnědá",
    },
  },
    {
      id: "3",
      name: "Zastíněné parkovací místo",
      emoji: "🚗",
      description: "Zastíněné parkovací místo, které poskytuje stín a komfort pro uživatele.",
      coolingEffect: 4,
      cost: "medium",
      priceMin: 45000,
      priceMax: 55000,
      maintenance: "low",
      lifespan: "15-20 let",
      material: "Dřevo, hliník, nerezová ocel",
      weight: "3 000 kg (s půdou a plně zavlažené)",
      dimensions: "2 x 3 x 5 m",
      modelPath: encodeURI("/P.stl"),
      topDownImagePath: encodeURI("/P-top.png"),
      dimensionsM: { width: 3, depth: 6 },
      waterFrequency: "1x za 2 týdny (bez srážek)",
      tags: ["modulární", "parkování", "venkovní"],
      specs: {
        "Barva": "Šedo-hnědá",
      },
    }
];

export const COST_LABEL: Record<string, string> = { low: "Nízké", medium: "Střední", high: "Vysoké" };
export const MAINT_LABEL: Record<string, string> = { low: "Nízká", medium: "Střední", high: "Vysoká" };
