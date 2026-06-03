export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface SelectedArea {
  points: [number, number][];
  bounds: Bounds;
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
