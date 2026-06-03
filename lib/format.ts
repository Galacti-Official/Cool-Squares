export function formatCZK(n: number): string {
  return n.toLocaleString("cs-CZ") + " Kč";
}

export function tempDeltaColor(delta: number | null | undefined): string {
  if (delta == null || delta === 0) return "#2e3a1f66";
  if (delta < -1.5) return "#2a7d4f";
  if (delta < -0.5) return "#5a9e72";
  return "#8ab89a";
}

export function tempDeltaLabel(delta: number | null | undefined): string {
  if (delta == null || delta === 0) return "—";
  return `${delta.toFixed(1)} °C`;
}
