import {
  type GatewayClient,
  type QueryName,
  type QueryParamsMap,
  type QueryResultMap,
  type BriefingRequest,
  type BriefingResponse,
  GatewayError,
  GatewayAuthError,
  GatewayTimeoutError,
  GatewayUnreachableError,
} from './types.js';
import type { DualPayload } from '@argon/graph';

export interface HttpGatewayClientOptions {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
}

export class HttpGatewayClient implements GatewayClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(options: HttpGatewayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.secret = options.secret;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async executeQuery<K extends QueryName>(
    workspaceId: string,
    queryName: K,
    params: QueryParamsMap[K]
  ): Promise<DualPayload<QueryResultMap[K]>> {
    const url = `${this.baseUrl}/api/v1/${encodeURIComponent(workspaceId)}/query/${queryName}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errJson: any;
        try {
          errJson = await res.json();
        } catch {
          errJson = { error: res.statusText };
        }

        if (res.status === 401) {
          throw new GatewayAuthError(errJson?.error ?? 'Unauthorized', errJson?.details);
        }
        if (res.status === 503) {
          if (errJson?.code === 'FALKORDB_TIMEOUT') {
            throw new GatewayTimeoutError(errJson?.error, errJson?.details);
          }
          throw new GatewayUnreachableError(errJson?.error, errJson?.details);
        }
        throw new GatewayError(
          errJson?.error ?? `Request failed with status ${res.status}`,
          errJson?.code ?? 'GATEWAY_ERROR',
          res.status,
          errJson?.details
        );
      }

      return (await res.json()) as DualPayload<QueryResultMap[K]>;
    } catch (err: any) {
      if (err instanceof GatewayError) {
        throw err;
      }
      if (err?.name === 'AbortError') {
        throw new GatewayTimeoutError(`Gateway request timed out after ${this.timeoutMs}ms`);
      }
      throw new GatewayUnreachableError(err?.message ?? 'Failed to connect to gateway', err);
    } finally {
      clearTimeout(timer);
    }
  }

  async generateBriefing(
    workspaceId: string,
    request: BriefingRequest
  ): Promise<BriefingResponse> {
    const url = `${this.baseUrl}/api/v1/${encodeURIComponent(workspaceId)}/briefing`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errJson: any;
        try {
          errJson = await res.json();
        } catch {
          errJson = { error: res.statusText };
        }
        if (res.status === 401) {
          throw new GatewayAuthError(errJson?.error ?? 'Unauthorized', errJson?.details);
        }
        throw new GatewayError(
          errJson?.error ?? `Briefing request failed with status ${res.status}`,
          errJson?.code ?? 'BRIEFING_ERROR',
          res.status,
          errJson?.details
        );
      }

      return (await res.json()) as BriefingResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; [key: string]: unknown }> {
    const url = `${this.baseUrl}/health`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return { ok: false, status: res.status };
      }
      const data = (await res.json()) as any;
      return { ok: true, ...data };
    } catch (err: any) {
      return { ok: false, error: err?.message };
    }
  }
}
