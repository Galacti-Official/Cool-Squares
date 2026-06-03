/** Lowercase + strip diacritics so Czech queries match accent-insensitively */
export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
