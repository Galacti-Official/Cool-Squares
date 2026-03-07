export type Category = "Květináče" | "Nádoby" | "Půdní pokryv" | "Vodní prvky" | "Posezení";

export interface Item {
  id: string;
  name: string;
  category: Category;
  emoji: string;
  description: string;
  coolingEffect: number;
  cost: "low" | "medium" | "high";
  maintenance: "low" | "medium" | "high";
  lifespan: string;       
  material: string;
  weight: string;          
  dimensions: string;
  waterNeeded: boolean;
  tags: string[];
  specs: Record<string, string>;
}

export const ITEMS: Item[] = [
  {
    id: "1",
    name: "Rostlinná stěna",
    category: "Květináče",
    emoji: "🪴",
    description: "Rostlinná stěna, která vytvoří příjemné zastíněné prostředí.",
    coolingEffect: 5,
    cost: "high",
    maintenance: "low",
    lifespan: "10–15 let",
    material: "Dřevo, hliník, nerezová ocel",
    weight: "2 000 kg (s půdou a plně zavlažené)",
    dimensions: "3 × 2 × 2 m",
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
