export type Category = "Květináče" | "Nádoby" | "Půdní pokryv" | "Vodní prvky" | "Posezení";

export interface Item {
  id: string;
  name: string;
  category: Category;
  emoji: string;
  description: string;
  coolingEffect: number;
  cost: number;
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
    id: "plant-wall",        
    name: "Rostlinná stěna",   
    category: "Květináče",
    emoji: "🪴",               
    description: "...",       
    coolingEffect: 5,
    cost: 60000,
    maintenance: "low",
    lifespan: "10–15 let",
    material: "Dřevo, hliník",
    weight: "2 000 kg",
    dimensions: "3 × 2 × 2 m",
    waterNeeded: true,
    tags: [],
    specs: {},
  }
];

export const CATEGORIES: Category[] = ["Květináče", "Nádoby", "Půdní pokryv", "Vodní prvky", "Posezení"];

export const COST_LABEL: Record<string, string> = { low: "Nízké", medium: "Střední", high: "Vysoké" };
export const MAINT_LABEL: Record<string, string> = { low: "Nízká", medium: "Střední", high: "Vysoká" };
