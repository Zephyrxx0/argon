import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/briefing/route';
import * as agentModule from '@argon/agent';

vi.mock('@argon/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof agentModule>();
  return {
    ...actual,
    runBriefingPipeline: vi.fn(),
    HttpGatewayClient: vi.fn(),
    DirectGraphGatewayClient: vi.fn(),
  };
});

describe('POST /api/briefing Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: unknown): NextRequest => {
    return new NextRequest('http://localhost:3000/api/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  it('rejects empty or missing task with 400 Bad Request', async () => {
    const req = createRequest({ task: '', workspaceId: 'ember-adr' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('VALIDATION_ERROR');
  });

  it('rejects workspaceId with path traversal or malicious characters with 400', async () => {
    const req = createRequest({
      task: 'Check auth',
      workspaceId: '../../etc/passwd',
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('VALIDATION_ERROR');
  });

  it('executes pipeline and returns 200 on valid request', async () => {
    const mockBriefingResponse = {
      status: 'SUCCESS',
      briefingId: 'b_123',
      briefing: {
        summary: { overview: 'Overview', intent: 'Intent', citations: ['#d:1'] },
        blastRadius: { directFiles: [], affectedComponents: [], citations: [] },
        keyOwners: { primaryOwners: [], recommendedReviewers: [], citations: [] },
        constrainingDecisions: { activeDecisions: [], citations: [] },
        precedents: { pastDecisions: [], citations: [] },
      },
      evidence: { totalCitedCount: 1, verifiedCitationCount: 1 },
    };

    vi.mocked(agentModule.runBriefingPipeline).mockResolvedValueOnce(mockBriefingResponse as any);

    const req = createRequest({
      task: 'Refactor billing/retry.ts',
      workspaceId: 'ember-adr-showcase',
      files: ['billing/retry.ts'],
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('SUCCESS');
    expect(data.briefing.summary.overview).toBe('Overview');
  });

  it('returns 503 when FalkorDB connection times out', async () => {
    vi.mocked(agentModule.runBriefingPipeline).mockRejectedValueOnce(
      new Error('ECONNREFUSED 127.0.0.1:6379')
    );

    const req = createRequest({
      task: 'Refactor billing/retry.ts',
      workspaceId: 'ember-adr-showcase',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.status).toBe('FALKORDB_TIMEOUT');
    expect(data.reason).toMatch(/FalkorDB Graph Unreachable \(503\)/i);
  });
});
