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

  // Mock scrollIntoView for cmdk and list views in JSDOM
  if (typeof window.HTMLElement !== 'undefined') {
    window.HTMLElement.prototype.scrollIntoView = function () {};
  }

  // Mock HTMLCanvasElement.prototype.getContext for Cytoscape in JSDOM
  if (typeof window.HTMLCanvasElement !== 'undefined') {
    window.HTMLCanvasElement.prototype.getContext = function (contextType: string) {
      if (contextType === '2d') {
        return {
          fillRect: () => {},
          clearRect: () => {},
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Array(w * h * 4),
          }),
          putImageData: () => {},
          createImageData: () => [],
          setTransform: () => {},
          drawImage: () => {},
          save: () => {},
          fillText: () => {},
          restore: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          stroke: () => {},
          translate: () => {},
          scale: () => {},
          rotate: () => {},
          arc: () => {},
          arcTo: () => {},
          fill: () => {},
          measureText: (text: string) => ({ width: text.length * 8 }),
          transform: () => {},
          rect: () => {},
          clip: () => {},
        } as any;
      }
      return null;
    } as any;
  }
}

