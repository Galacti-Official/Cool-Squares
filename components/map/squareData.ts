export interface Square {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  year: number;
  tempBefore: number;   // °C
  tempAfter: number;
  treesAdded: number;
  m2Cooled: number;
  interventions: string[];
  description: string;
}

export const SQUARES: Square[] = [
  {
    id: "dam-amsterdam",
    name: "Dam Square",
    city: "Amsterdam, NL",
    lat: 52.3731,
    lng: 4.8932,
    year: 2022,
    tempBefore: 42,
    tempAfter: 34,
    treesAdded: 24,
    m2Cooled: 9800,
    interventions: ["Tree canopy", "Reflective paving", "Misting jets"],
    description: "Amsterdam's iconic central square transformed with 24 new lime trees and high-albedo granite paving.",
  },
  {
    id: "plaza-mayor-madrid",
    name: "Plaza Mayor",
    city: "Madrid, ES",
    lat: 40.4154,
    lng: -3.7074,
    year: 2021,
    tempBefore: 51,
    tempAfter: 41,
    treesAdded: 38,
    m2Cooled: 12400,
    interventions: ["Shade canopies", "Water features", "Green walls"],
    description: "Historic plaza retrofitted with tensile fabric canopies and a shallow reflective pool along the central axis.",
  },
  {
    id: "piazza-navona-rome",
    name: "Piazza Navona",
    city: "Rome, IT",
    lat: 41.8992,
    lng: 12.4731,
    year: 2023,
    tempBefore: 48,
    tempAfter: 39,
    treesAdded: 16,
    m2Cooled: 7600,
    interventions: ["Permeable paving", "Misting jets", "Tree canopy"],
    description: "Baroque piazza retrofitted with permeable travertine-look paving and a low-profile mist network.",
  }
];
