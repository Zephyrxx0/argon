export interface ThemeTokens {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  accent: string;
  accentForeground: string;
  success: string;
  warning: string;
  danger: string;
  card: string;
  cardForeground: string;
  nodeFile: string;
  nodePerson: string;
  nodeComponent: string;
  nodeDecision: string;
}

/**
 * Brutalist monochrome palette. Node types are told apart by shape and
 * brightness; chroma is reserved for state (success / warning / danger).
 */
export const DEFAULT_THEME: ThemeTokens = {
  background: '#000000',
  foreground: '#ffffff',
  muted: '#0c0c0c',
  mutedForeground: '#8f8f8f',
  border: '#2b2b2b',
  accent: '#ffffff',
  accentForeground: '#000000',
  success: '#3ddc84',
  warning: '#ffb020',
  danger: '#ff4d4d',
  card: '#000000',
  cardForeground: '#ffffff',
  nodeFile: '#8f8f8f',
  nodePerson: '#cfcfcf',
  nodeComponent: '#ffffff',
  nodeDecision: '#ffffff',
};

/**
 * Reads theme tokens from the DOM's computed styles at runtime,
 * falling back to the static monochrome palette (SSR / tests).
 */
export function getThemeTokens(): ThemeTokens {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ...DEFAULT_THEME };
  }

  try {
    const rootStyle = window.getComputedStyle(document.body || document.documentElement);
    const getVar = (name: string, fallback: string): string => {
      const val = rootStyle.getPropertyValue(name).trim();
      return val || fallback;
    };

    return {
      background: getVar('--color-background', DEFAULT_THEME.background),
      foreground: getVar('--color-foreground', DEFAULT_THEME.foreground),
      muted: getVar('--color-muted', DEFAULT_THEME.muted),
      mutedForeground: getVar('--color-muted-foreground', DEFAULT_THEME.mutedForeground),
      border: getVar('--color-border', DEFAULT_THEME.border),
      accent: getVar('--color-accent', DEFAULT_THEME.accent),
      accentForeground: getVar('--color-accent-foreground', DEFAULT_THEME.accentForeground),
      success: getVar('--color-success', DEFAULT_THEME.success),
      warning: getVar('--color-warning', DEFAULT_THEME.warning),
      danger: getVar('--color-danger', DEFAULT_THEME.danger),
      card: getVar('--color-card', DEFAULT_THEME.card),
      cardForeground: getVar('--color-card-foreground', DEFAULT_THEME.cardForeground),
      nodeFile: getVar('--color-node-file', DEFAULT_THEME.nodeFile),
      nodePerson: getVar('--color-node-person', DEFAULT_THEME.nodePerson),
      nodeComponent: getVar('--color-node-component', DEFAULT_THEME.nodeComponent),
      nodeDecision: getVar('--color-node-decision', DEFAULT_THEME.nodeDecision),
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}
