export const ErrorCodes = {
  AUTH_CONFIG_ERROR: 'AUTH_CONFIG_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_QUERY: 'UNKNOWN_QUERY',
  FALKORDB_TIMEOUT: 'FALKORDB_TIMEOUT',
  FALKORDB_UNREACHABLE: 'FALKORDB_UNREACHABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface GatewayErrorResponse {
  error: string;
  code: ErrorCode | string;
  details?: unknown;
}

export interface GatewayHealthResponse {
  status: 'ok';
  falkor: 'healthy' | 'unreachable';
  uptime: number;
  timestamp: number;
}

