import { betterAuth } from 'better-auth';
import { anonymous, jwt } from 'better-auth/plugins';
import Database from 'better-sqlite3';
import { SignJWT } from 'jose';
import path from 'node:path';

const dbPath = process.env.AUTH_DB_PATH || path.resolve(process.cwd(), 'auth.sqlite');
const db = new Database(dbPath);

// Ensure Better Auth SQLite tables and indices exist
db.exec(`
  create table if not exists "user" (
    "id" text not null primary key,
    "name" text not null,
    "email" text not null unique,
    "emailVerified" integer not null,
    "image" text,
    "createdAt" date not null,
    "updatedAt" date not null,
    "isAnonymous" integer
  );
  create table if not exists "session" (
    "id" text not null primary key,
    "expiresAt" date not null,
    "token" text not null unique,
    "createdAt" date not null,
    "updatedAt" date not null,
    "ipAddress" text,
    "userAgent" text,
    "userId" text not null references "user" ("id") on delete cascade
  );
  create table if not exists "account" (
    "id" text not null primary key,
    "accountId" text not null,
    "providerId" text not null,
    "userId" text not null references "user" ("id") on delete cascade,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" date,
    "refreshTokenExpiresAt" date,
    "scope" text,
    "password" text,
    "createdAt" date not null,
    "updatedAt" date not null
  );
  create table if not exists "verification" (
    "id" text not null primary key,
    "identifier" text not null,
    "value" text not null,
    "expiresAt" date not null,
    "createdAt" date not null,
    "updatedAt" date not null
  );
  create table if not exists "jwks" (
    "id" text not null primary key,
    "publicKey" text not null,
    "privateKey" text not null,
    "createdAt" date not null,
    "expiresAt" date,
    "alg" text,
    "crv" text
  );
  create index if not exists "session_userId_idx" on "session" ("userId");
  create index if not exists "account_userId_idx" on "account" ("userId");
  create index if not exists "verification_identifier_idx" on "verification" ("identifier");
`);

const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const isBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.npm_lifecycle_event === 'build';

const secretKey =
  process.env.BETTER_AUTH_SECRET ||
  (process.env.NODE_ENV === 'production' && !isBuildPhase
    ? (() => {
        throw new Error('BETTER_AUTH_SECRET environment variable is required in production');
      })()
    : 'argon-dev-secret-at-least-32-chars-long');

export const auth = betterAuth({
  database: db,
  secret: secretKey,
  baseURL,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    },
  },
  plugins: [
    anonymous({
      emailDomainName: 'guest.argon.internal',
      onLinkAccount: async ({ anonymousUser, newUser }: { anonymousUser: any; newUser: any }) => {
        try {
          const { ArgonGraphClient, migrateGuestAccess } = await import('@argon/graph');
          const graphClient = new ArgonGraphClient();
          await graphClient.connect();
          await migrateGuestAccess(graphClient, {
            guestId: anonymousUser?.id || anonymousUser?.user?.id,
            authUserId: newUser?.id || newUser?.user?.id,
          });
          await graphClient.close();
        } catch (err) {
          console.error('[auth:onLinkAccount] Failed to migrate guest graph accesses:', err);
        }
      },
    }),
    jwt({
      jwks: {
        remoteUrl: `${baseURL}/api/auth/jwks`,
        keyPairConfig: { alg: 'EdDSA' },
      },
      jwt: {
        sign: async (payload) => {
          const secret = new TextEncoder().encode(secretKey);

          let userAccessToken: string | undefined;
          let userLogin: string | undefined;
          try {
            if (payload.sub) {
              const account = db
                .prepare('SELECT accessToken FROM account WHERE userId = ? AND providerId = ? LIMIT 1')
                .get(payload.sub, 'github') as { accessToken?: string } | undefined;
              userAccessToken = account?.accessToken;

              const userRow = db
                .prepare('SELECT name FROM user WHERE id = ? LIMIT 1')
                .get(payload.sub) as { name?: string } | undefined;
              userLogin = userRow?.name;
            }
          } catch {
            // Ignore SQLite lookup error in test/in-memory environments
          }

          return await new SignJWT({
            ...payload,
            userId: payload.sub,
            userAccessToken,
            login: userLogin,
            isAnonymous: Boolean((payload as any).isAnonymous),
          })
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuedAt()
            .setExpirationTime('15m')
            .sign(secret);
        },
      },
    }),
  ],
});
