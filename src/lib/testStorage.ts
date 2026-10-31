// In-memory stand-ins for localStorage, used only by tests.

import type { KeyValueStore } from './storage';

export function memoryStorage(initial: Record<string, string> = {}): KeyValueStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** Storage that throws, like a browser with storage blocked or full. */
export function failingStorage(
  options: { failGet?: boolean; failSet?: boolean },
  initial: Record<string, string> = {},
): KeyValueStore & { map: Map<string, string> } {
  const inner = memoryStorage(initial);
  return {
    ...inner,
    getItem: (key) => {
      if (options.failGet) throw new Error('SecurityError');
      return inner.getItem(key);
    },
    setItem: (key, value) => {
      if (options.failSet) throw new Error('QuotaExceededError');
      inner.setItem(key, value);
    },
  };
}
