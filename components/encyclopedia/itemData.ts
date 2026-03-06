export type Category = "Planters" | "Pots" | "Ground Cover" | "Water Features" | "Seating";

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
    name: "Modulární květináč",
    category: "Planters",
    emoji: "🪴",
    description: "Modulární květináč pro vnitřní i venkovní použití.",
    coolingEffect: 5,
    cost: "low",
    maintenance: "low",
    lifespan: "10–15 years",
    material: "Plast",
    weight: "2 kg",
    dimensions: "30 × 30 × 20 cm",
    waterNeeded: false,
    tags: ["modulární", "květináč", "vnitřní"],
    specs: {
      "Barva": "Zelená",
      "Výška": "20 cm",
      "Průměr": "30 cm"
    }
  }
];

export const CATEGORIES: Category[] = ["Planters", "Pots", "Ground Cover", "Water Features", "Seating"];

export const COST_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
export const MAINT_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
