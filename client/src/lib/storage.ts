/**
 * SSR-safe storage helpers
 * ---------------------------------------------------------------------------
 * The public pages are prerendered at build time with `react-dom/server`,
 * where there is no `window`. A bare `localStorage.getItem(...)` during render
 * would crash the prerender. These helpers behave exactly like `localStorage`
 * in the browser and degrade to "nothing stored" on the server.
 *
 * They also swallow the two real-world browser failure modes:
 *   - Safari private mode throws on any localStorage access
 *   - a corrupt JSON payload used to white-screen the app (JSON.parse throw)
 */

function getStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    // Accessing localStorage itself can throw (private mode / blocked cookies).
    return null;
  }
}

export function readStorage(key: string): string | null {
  const store = getStore();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Read + parse a JSON payload. Returns null when missing or corrupt. */
export function readStorageJSON<T>(key: string): T | null {
  const raw = readStorage(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch {
    // Quota exceeded or private mode — never worth crashing the UI over.
  }
}

export function writeStorageJSON(key: string, value: unknown): void {
  try {
    writeStorage(key, JSON.stringify(value));
  } catch {
    // Unserializable value — ignore.
  }
}

export function removeStorage(key: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Ignore.
  }
}

/**
 * Supabase persists its auth token in localStorage under
 * `sb-<project-ref>-auth-token`. Used to decide whether the prerendered
 * public page can be hydrated as-is or must be re-rendered on the client.
 */
export function hasStoredSupabaseSession(): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith("sb-") && key.includes("auth-token")) return true;
    }
  } catch {
    return false;
  }
  return false;
}
