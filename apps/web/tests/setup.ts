import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Pages with lazily-laid-out graphs render slower when the whole monorepo's tests run in parallel
configure({ asyncUtilTimeout: 5000 });

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

  // React Flow measures with DOMMatrixReadOnly, which JSDOM lacks
  if (!(window as any).DOMMatrixReadOnly) {
    (window as any).DOMMatrixReadOnly = class {
      m22: number;
      constructor(transform?: string) {
        const scale = transform?.match(/scale\(([1-9.]+)\)/)?.[1];
        this.m22 = scale !== undefined ? +scale : 1;
      }
    };
  }

  // Mock HTMLCanvasElement.prototype.getContext (landing graph field, html-to-image) in JSDOM
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

