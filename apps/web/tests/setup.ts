import '@testing-library/jest-dom/vitest';

// Mock ResizeObserver for react-resizable-panels and layout tests
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined') {
  window.ResizeObserver = window.ResizeObserver || ResizeObserverMock;

  // Mock matchMedia
  window.matchMedia = window.matchMedia || function (query: string) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };
}
