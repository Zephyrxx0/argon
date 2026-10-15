import { FalkorDB, Graph } from 'falkordb';

export class FalkorUnavailableError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(`[NO GRAPH, NO ANSWER] FalkorDB is unavailable: ${message}`);
    this.name = 'FalkorUnavailableError';
  }
}

export interface ArgonClientConfig {
  url?: string;
  defaultTimeoutMs?: number;
  timeoutMs?: number;
}

export class ArgonGraphClient {
  private client: FalkorDB | null = null;
  public readonly url: string;
  public readonly defaultTimeoutMs: number;

  constructor(config?: ArgonClientConfig) {
    this.url = config?.url ?? process.env.FALKORDB_URL ?? 'falkor://localhost:6379';
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? config?.timeoutMs ?? 5000;
  }

  async connect(): Promise<void> {
    try {
      this.client = await FalkorDB.connect({
        url: this.url,
        socket: {
          connectTimeout: this.defaultTimeoutMs,
        },
      });
    } catch (err: any) {
      throw new FalkorUnavailableError(err?.message ?? 'Failed to establish connection', err);
    }
  }

  getRawClient(): FalkorDB {
    if (!this.client) {
      throw new FalkorUnavailableError('Client not connected');
    }
    return this.client;
  }

  selectGraph(workspaceId: string): Graph {
    const client = this.getRawClient();
    return client.selectGraph(workspaceId);
  }

  // Alias for selectGraph for convenience
  getGraph(workspaceId: string): Graph {
    return this.selectGraph(workspaceId);
  }

  async roQuery<T = any>(
    workspaceId: string,
    cypher: string,
    params: Record<string, any> = {},
    timeoutMs?: number
  ) {
    const graph = this.selectGraph(workspaceId);
    try {
      return await graph.roQuery<T>(cypher, {
        params,
        TIMEOUT: timeoutMs ?? this.defaultTimeoutMs,
      });
    } catch (err: any) {
      if (
        err instanceof FalkorUnavailableError ||
        err.message?.includes('Connection closed') ||
        err.message?.includes('ECONNREFUSED') ||
        err.code === 'ECONNREFUSED' ||
        err.name === 'AggregateError'
      ) {
        throw new FalkorUnavailableError(err.message ?? 'Connection lost during query', err);
      }
      throw err;
    }
  }

  async query<T = any>(
    workspaceId: string,
    cypher: string,
    params: Record<string, any> = {},
    timeoutMs?: number
  ) {
    const graph = this.selectGraph(workspaceId);
    try {
      return await graph.query<T>(cypher, {
        params,
        TIMEOUT: timeoutMs ?? this.defaultTimeoutMs,
      });
    } catch (err: any) {
      if (
        err instanceof FalkorUnavailableError ||
        err.message?.includes('Connection closed') ||
        err.message?.includes('ECONNREFUSED') ||
        err.code === 'ECONNREFUSED' ||
        err.name === 'AggregateError'
      ) {
        throw new FalkorUnavailableError(err.message ?? 'Connection lost during query', err);
      }
      throw err;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const conn = await this.client.connection;
      const res = await conn.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors
      } finally {
        this.client = null;
      }
    }
  }
}
