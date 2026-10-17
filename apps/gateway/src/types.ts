export const ErrorCodes = {
  AUTH_CONFIG_ERROR: 'AUTH_CONFIG_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_QUERY: 'UNKNOWN_QUERY',
  FALKORDB_TIMEOUT: 'FALKORDB_TIMEOUT',
  FALKORDB_UNREACHABLE: 'FALKORDB_UNREACHABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface JwtAuthUser {
  userId: string;
  isAnonymous: boolean;
  [key: string]: unknown;
}

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

