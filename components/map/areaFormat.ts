export function formatAreaByMagnitude(areaSqKm: number): string {
  const areaSqM = Math.max(0, areaSqKm * 1_000_000);

  if (areaSqM < 10_000) {
    return `${areaSqM.toLocaleString("cs-CZ", {
      maximumFractionDigits: areaSqM < 100 ? 1 : 0,
    })} m²`;
  }

  const areaHa = areaSqM / 10_000;
  if (areaHa < 100) {
    return `${areaHa.toLocaleString("cs-CZ", {
      maximumFractionDigits: areaHa < 10 ? 2 : 1,
    })} ha`;
  }

  return `${areaSqKm.toLocaleString("cs-CZ", {
    maximumFractionDigits: areaSqKm < 10 ? 2 : 1,
  })} km²`;
}

export function formatDistanceByMagnitude(distanceKm: number): string {
  const distanceM = Math.max(0, distanceKm * 1000);

  if (distanceM < 1000) {
    return `~${distanceM.toLocaleString("cs-CZ", {
      maximumFractionDigits: distanceM < 100 ? 1 : 0,
    })} m`;
  }

  return `~${distanceKm.toLocaleString("cs-CZ", {
    maximumFractionDigits: distanceKm < 10 ? 2 : 1,
  })} km`;
}
