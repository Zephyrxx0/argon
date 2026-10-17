import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  GraphSyncProvider,
  useGraphSync,
  formatSyncBadgeText,
} from '@/lib/graph-sync';
import {
  createWorkspaceEventSource,
  type SyncCompleteEvent,
} from '@/lib/events-client';

describe('Graph Sync & Live Incremental Sync Stream (Task 08-03-02, SYNC-03)', () => {
  let mockEventSourceInstances: any[] = [];
  let originalEventSource: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSourceInstances = [];

    originalEventSource = (globalThis as any).EventSource;

    // Mock EventSource for JSDOM
    (globalThis as any).EventSource = vi.fn().mockImplementation(function (this: any, url: string) {
      this.url = url;
      this.listeners = new Map<string, Function[]>();
      this.close = vi.fn();

      this.addEventListener = vi.fn((event: string, handler: Function) => {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(handler);
      });

      this.removeEventListener = vi.fn();

      mockEventSourceInstances.push(this);
    });
  });

  afterEach(() => {
    (globalThis as any).EventSource = originalEventSource;
  });

  describe('formatSyncBadgeText', () => {
    it('formats commits and superseded ADRs count', () => {
      const event: SyncCompleteEvent = {
        workspaceId: 'ws-test',
        trigger: 'pull_request',
        updated: { commits: ['c1', 'c2'], files: ['f1.ts'], decisions: ['d1'] },
        superseded: ['old-adr-1', 'old-adr-2'],
      };
      const text = formatSyncBadgeText(event);
      expect(text).toBe('LIVE SYNC • +2 commits, 2 ADR superseded');
    });

    it('formats single commit and newly accepted ADR', () => {
      const event: SyncCompleteEvent = {
        workspaceId: 'ws-test',
        trigger: 'push',
        updated: { commits: ['c1'], files: [], decisions: ['d1'] },
        superseded: [],
      };
      const text = formatSyncBadgeText(event);
      expect(text).toBe('LIVE SYNC • +1 commit, +1 ADR');
    });

    it('formats fallback when updated list is empty', () => {
      const event: SyncCompleteEvent = {
        workspaceId: 'ws-test',
        trigger: 'push',
        updated: { commits: [], files: [], decisions: [] },
        superseded: [],
      };
      const text = formatSyncBadgeText(event);
      expect(text).toBe('LIVE SYNC • graph updated');
    });
  });

  describe('createWorkspaceEventSource', () => {
    it('constructs EventSource with correct workspace url and token query parameter', () => {
      const onSyncComplete = vi.fn();
      const onConnected = vi.fn();

      const handle = createWorkspaceEventSource('test-ws-1', {
        baseUrl: 'http://localhost:3000',
        token: 'jwt-token-abc',
        onConnected,
        onSyncComplete,
      });

      expect(mockEventSourceInstances.length).toBe(1);
      const instance = mockEventSourceInstances[0];
      expect(instance.url).toBe(
        'http://localhost:3000/api/v1/workspaces/test-ws-1/events?token=jwt-token-abc'
      );

      // Simulate open event
      instance.onopen();
      expect(onConnected).toHaveBeenCalledTimes(1);

      // Simulate incoming sync:complete event
      const syncPayload: SyncCompleteEvent = {
        workspaceId: 'test-ws-1',
        trigger: 'push',
        updated: { commits: ['sha-1'], files: ['index.ts'], decisions: [] },
        superseded: [],
      };

      const syncListeners = instance.listeners.get('sync:complete') || [];
      expect(syncListeners.length).toBe(1);
      syncListeners[0]({ data: JSON.stringify(syncPayload) });

      expect(onSyncComplete).toHaveBeenCalledWith(syncPayload);

      // Close handle
      handle.close();
      expect(instance.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('GraphSyncProvider & useGraphSync Hook', () => {
    it('maintains both canvas interaction state and live sync state', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <GraphSyncProvider workspaceId="active-ws" token="test-token">
          {children}
        </GraphSyncProvider>
      );

      const { result } = renderHook(() => useGraphSync(), { wrapper });

      expect(result.current.hoveredNodeId).toBeNull();
      expect(result.current.lastSyncEvent).toBeNull();
      expect(result.current.syncBadgeText).toBeNull();

      // Test canvas node selection
      act(() => {
        result.current.setSelectedNode('node-alpha');
        result.current.setHoveredNode('node-beta');
      });

      expect(result.current.selectedNodeId).toBe('node-alpha');
      expect(result.current.hoveredNodeId).toBe('node-beta');

      // Test manual badge clear
      act(() => {
        result.current.clearSyncBadge();
      });
      expect(result.current.syncBadgeText).toBeNull();
    });

    it('receives sync:complete event and updates lastSyncEvent and syncBadgeText', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <GraphSyncProvider workspaceId="active-ws" token="test-token">
          {children}
        </GraphSyncProvider>
      );

      const { result } = renderHook(() => useGraphSync(), { wrapper });

      expect(mockEventSourceInstances.length).toBe(1);
      const instance = mockEventSourceInstances[0];

      const listenerCallback = vi.fn();
      let unsubscribe: () => void;
      act(() => {
        unsubscribe = result.current.subscribeSync(listenerCallback);
      });

      const syncPayload: SyncCompleteEvent = {
        workspaceId: 'active-ws',
        trigger: 'pull_request',
        updated: { commits: ['merge-1'], files: ['adr.md'], decisions: ['dec-1'] },
        superseded: ['dec-old'],
      };

      act(() => {
        const syncListeners = instance.listeners.get('sync:complete') || [];
        syncListeners[0]({ data: JSON.stringify(syncPayload) });
      });

      expect(result.current.lastSyncEvent).toEqual(syncPayload);
      expect(result.current.isSyncing).toBe(true);
      expect(result.current.syncBadgeText).toContain('+1 commit, 1 ADR superseded');
      expect(listenerCallback).toHaveBeenCalledWith(syncPayload);

      act(() => {
        unsubscribe();
      });
    });
  });
});
