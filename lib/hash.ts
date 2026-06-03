/** Base64-encode a JSON-serializable payload for use in a URL hash */
export function encodeHashPayload(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

export function decodeHashPayload<T>(value: string): T | null {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
