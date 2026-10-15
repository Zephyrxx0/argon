export interface Theme2077Tokens {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  accent: string;
  accentForeground: string;
  warning: string;
  danger: string;
  card: string;
  cardForeground: string;
  nodeFile: string;
  nodePerson: string;
  nodeComponent: string;
  nodeDecision: string;
}

export const DEFAULT_2077_THEME: Theme2077Tokens = {
  background: '#090a0f',
  foreground: '#e6edf3',
  muted: '#161b22',
  mutedForeground: '#8b949e',
  border: '#30363d',
  accent: '#00f0ff',
  accentForeground: '#090a0f',
  warning: '#ffb800',
  danger: '#ff0055',
  card: '#0d1117',
  cardForeground: '#c9d1d9',
  nodeFile: '#58a6ff',
  nodePerson: '#bc8cff',
  nodeComponent: '#00f0ff',
  nodeDecision: '#ffb800',
};

/**
 * Safely extracts 2077 theme tokens from DOM computed styles at runtime,
 * falling back to the standard 2077 cyberpunk design system constants.
 */
export function get2077ThemeTokens(): Theme2077Tokens {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ...DEFAULT_2077_THEME };
  }

  try {
    const rootStyle = window.getComputedStyle(document.body || document.documentElement);
    const getVar = (name: string, fallback: string): string => {
      const val = rootStyle.getPropertyValue(name).trim();
      return val || fallback;
    };

    return {
      background: getVar('--color-background', DEFAULT_2077_THEME.background),
      foreground: getVar('--color-foreground', DEFAULT_2077_THEME.foreground),
      muted: getVar('--color-muted', DEFAULT_2077_THEME.muted),
      mutedForeground: getVar('--color-muted-foreground', DEFAULT_2077_THEME.mutedForeground),
      border: getVar('--color-border', DEFAULT_2077_THEME.border),
      accent: getVar('--color-accent', DEFAULT_2077_THEME.accent),
      accentForeground: getVar('--color-accent-foreground', DEFAULT_2077_THEME.accentForeground),
      warning: getVar('--color-warning', DEFAULT_2077_THEME.warning),
      danger: getVar('--color-danger', DEFAULT_2077_THEME.danger),
      card: getVar('--color-card', DEFAULT_2077_THEME.card),
      cardForeground: getVar('--color-card-foreground', DEFAULT_2077_THEME.cardForeground),
      nodeFile: getVar('--color-node-file', DEFAULT_2077_THEME.nodeFile),
      nodePerson: getVar('--color-node-person', DEFAULT_2077_THEME.nodePerson),
      nodeComponent: getVar('--color-accent', DEFAULT_2077_THEME.nodeComponent),
      nodeDecision: getVar('--color-warning', DEFAULT_2077_THEME.nodeDecision),
    };
  } catch {
    return { ...DEFAULT_2077_THEME };
  }
}

