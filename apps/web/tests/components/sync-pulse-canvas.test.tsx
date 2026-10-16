import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HudControls } from '@/components/canvas/hud-controls';
import { BriefingView, type WebBriefingResponse } from '@/components/briefing/briefing-view';
import * as graphSyncModule from '@/lib/graph-sync';

describe('Live Incremental Sync UI Components (Task 08-03-03, SYNC-03)', () => {
  describe('HUDControls Live Sync Badge', () => {
    it('does not display live sync badge when syncBadgeText is null', () => {
      vi.spyOn(graphSyncModule, 'useGraphSync').mockReturnValue({
        hoveredNodeId: null,
        selectedNodeId: null,
        highlightedIds: [],
        focusRequest: null,
        setHoveredNode: vi.fn(),
        setSelectedNode: vi.fn(),
        focusNode: vi.fn(),
        clearSelection: vi.fn(),
        setHighlightedIds: vi.fn(),
        lastSyncEvent: null,
        isSyncing: false,
        syncBadgeText: null,
        clearSyncBadge: vi.fn(),
        subscribeSync: vi.fn().mockReturnValue(() => {}),
      });

      render(<HudControls cy={null} />);
      expect(screen.queryByTestId('hud-live-sync-badge')).toBeNull();
    });

    it('renders glowing monospace status badge when syncBadgeText is present', () => {
      vi.spyOn(graphSyncModule, 'useGraphSync').mockReturnValue({
        hoveredNodeId: null,
        selectedNodeId: null,
        highlightedIds: [],
        focusRequest: null,
        setHoveredNode: vi.fn(),
        setSelectedNode: vi.fn(),
        focusNode: vi.fn(),
        clearSelection: vi.fn(),
        setHighlightedIds: vi.fn(),
        lastSyncEvent: null,
        isSyncing: true,
        syncBadgeText: 'LIVE SYNC • +3 commits, 1 ADR superseded',
        clearSyncBadge: vi.fn(),
        subscribeSync: vi.fn().mockReturnValue(() => {}),
      });

      render(<HudControls cy={null} />);
      const badge = screen.getByTestId('hud-live-sync-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain('LIVE SYNC • +3 commits, 1 ADR superseded');
    });
  });

  describe('BriefingView Stale Citations Warning Banner', () => {
    const mockBriefingResponse: WebBriefingResponse = {
      status: 'SUCCESS',
      workspaceId: 'test-ws',
      briefing: {
        summary: {
          executiveSummary: 'Test Summary',
          keyTakeaways: [
            { text: 'Takeaway 1', citedNodeIds: ['f:apps/web/main.ts', 'd:ADR-0004'] },
          ],
        },
        blastRadius: {
          impactScore: 45,
          affectedComponents: [],
          propagationPaths: [],
        },
        keyOwners: [],
        constrainingDecisions: [],
        precedents: [],
      } as any,
      evidence: {
        verifiedNodeIds: ['f:apps/web/main.ts', 'd:ADR-0004'],
      },
    };

    it('does not display stale alert when sync event does not match briefing citations', () => {
      vi.spyOn(graphSyncModule, 'useGraphSync').mockReturnValue({
        hoveredNodeId: null,
        selectedNodeId: null,
        highlightedIds: [],
        focusRequest: null,
        setHoveredNode: vi.fn(),
        setSelectedNode: vi.fn(),
        focusNode: vi.fn(),
        clearSelection: vi.fn(),
        setHighlightedIds: vi.fn(),
        lastSyncEvent: {
          workspaceId: 'test-ws',
          trigger: 'push',
          updated: { commits: ['c1'], files: ['other/file.ts'], decisions: [] },
          superseded: [],
        },
        isSyncing: false,
        syncBadgeText: null,
        clearSyncBadge: vi.fn(),
        subscribeSync: vi.fn().mockReturnValue(() => {}),
      });

      render(<BriefingView response={mockBriefingResponse} />);
      expect(screen.queryByTestId('briefing-stale-alert')).toBeNull();
    });

    it('displays warning banner when an updated file matches a cited node ID', () => {
      const handleReRun = vi.fn();

      vi.spyOn(graphSyncModule, 'useGraphSync').mockReturnValue({
        hoveredNodeId: null,
        selectedNodeId: null,
        highlightedIds: [],
        focusRequest: null,
        setHoveredNode: vi.fn(),
        setSelectedNode: vi.fn(),
        focusNode: vi.fn(),
        clearSelection: vi.fn(),
        setHighlightedIds: vi.fn(),
        lastSyncEvent: {
          workspaceId: 'test-ws',
          trigger: 'push',
          updated: { commits: ['c2'], files: ['apps/web/main.ts'], decisions: [] },
          superseded: [],
        },
        isSyncing: true,
        syncBadgeText: null,
        clearSyncBadge: vi.fn(),
        subscribeSync: vi.fn().mockReturnValue(() => {}),
      });

      render(
        <BriefingView
          response={mockBriefingResponse}
          onReRunBriefing={handleReRun}
        />
      );

      const alertBanner = screen.getByTestId('briefing-stale-alert');
      expect(alertBanner).toBeInTheDocument();
      expect(alertBanner.textContent).toContain('Repository updated since briefing was generated');

      // Click Re-Run Briefing button
      const rerunBtn = screen.getByTestId('briefing-rerun-btn');
      fireEvent.click(rerunBtn);
      expect(handleReRun).toHaveBeenCalledTimes(1);
    });

    it('displays warning banner when a superseded decision matches a cited decision ID', () => {
      vi.spyOn(graphSyncModule, 'useGraphSync').mockReturnValue({
        hoveredNodeId: null,
        selectedNodeId: null,
        highlightedIds: [],
        focusRequest: null,
        setHoveredNode: vi.fn(),
        setSelectedNode: vi.fn(),
        focusNode: vi.fn(),
        clearSelection: vi.fn(),
        setHighlightedIds: vi.fn(),
        lastSyncEvent: {
          workspaceId: 'test-ws',
          trigger: 'pull_request',
          updated: { commits: [], files: [], decisions: ['ADR-0005'] },
          superseded: ['ADR-0004'],
        },
        isSyncing: true,
        syncBadgeText: null,
        clearSyncBadge: vi.fn(),
        subscribeSync: vi.fn().mockReturnValue(() => {}),
      });

      render(<BriefingView response={mockBriefingResponse} />);

      const alertBanner = screen.getByTestId('briefing-stale-alert');
      expect(alertBanner).toBeInTheDocument();
      expect(alertBanner.textContent).toContain('Repository updated since briefing was generated');
    });
  });
});
