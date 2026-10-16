export interface ArgonUiPreferences {
  layoutMode: 'fcose' | 'concentric' | 'breadthfirst' | string;
  split_viewport_sizes: [number, number];
  query_history: string[];
}

export const PREFERENCES_STORAGE_KEY = 'argon_ui_preferences';

export const DEFAULT_PREFERENCES: ArgonUiPreferences = {
  layoutMode: 'fcose',
  split_viewport_sizes: [45, 55],
  query_history: [],
};

export function getStoredPreferences(): ArgonUiPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    let parsed: Partial<ArgonUiPreferences> = {};
    if (raw) {
      parsed = JSON.parse(raw);
    }

    // Also check standalone query_history key if present
    const rawHistory = localStorage.getItem('query_history');
    if (rawHistory && !parsed.query_history) {
      try {
        parsed.query_history = JSON.parse(rawHistory);
      } catch {
        // ignore
      }
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      query_history: parsed.query_history || DEFAULT_PREFERENCES.query_history,
      split_viewport_sizes: parsed.split_viewport_sizes || DEFAULT_PREFERENCES.split_viewport_sizes,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveStoredPreferences(partial: Partial<ArgonUiPreferences>): ArgonUiPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const current = getStoredPreferences();
    const updated: ArgonUiPreferences = {
      ...current,
      ...partial,
    };
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
    if (partial.query_history) {
      localStorage.setItem('query_history', JSON.stringify(partial.query_history));
    }
    return updated;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function addQueryToHistory(query: string): string[] {
  if (!query || typeof window === 'undefined') return [];
  try {
    const prefs = getStoredPreferences();
    const history = [query, ...prefs.query_history.filter((q) => q !== query)].slice(0, 10);
    saveStoredPreferences({ query_history: history });
    return history;
  } catch {
    return [];
  }
}
