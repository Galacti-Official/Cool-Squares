/**
 * Loads the bundled Czech-border GeoJSON Feature from /public
 * Replaces the previous ~15 MB cross-origin fetch of the full world dataset
 * Cached, so the file is fetched at most once per page load
 */
const CZ_BORDER_URL = "/cz-border.geojson";
let czFeaturePromise: Promise<any | null> | null = null;

export function loadCzFeature(): Promise<any | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!czFeaturePromise) {
    czFeaturePromise = fetch(CZ_BORDER_URL)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return czFeaturePromise;
}
