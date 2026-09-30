import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { neon } from "@neondatabase/serverless";
import {
  SessionStorage,
  type ISessionData,
} from "@gohighlevel/api-client";

const TABLE = "ghl_oauth_sessions";

function connectionString(): string {
  const value =
    process.env.GHL_OAUTH_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error(
      "GHL_OAUTH_DATABASE_URL (or DATABASE_URL) is required for durable HighLevel OAuth storage",
    );
  }

  return value;
}

function encryptionKey(): Buffer {
  const raw = process.env.GHL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "GHL_TOKEN_ENCRYPTION_KEY is required for durable HighLevel OAuth storage",
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;

  throw new Error(
    "GHL_TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64",
  );
}

function seal(value: ISessionData): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function unseal(value: string): ISessionData {
  const [version, ivPart, tagPart, ciphertextPart] = value.split(".");
  if (
    version !== "v1" ||
    !ivPart ||
    !tagPart ||
    !ciphertextPart
  ) {
    throw new Error("Invalid stored HighLevel OAuth session format");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as ISessionData;
}

export function isDurableOAuthStorageConfigured(): boolean {
  return Boolean(
    (process.env.GHL_OAUTH_DATABASE_URL || process.env.DATABASE_URL) &&
      process.env.GHL_TOKEN_ENCRYPTION_KEY,
  );
}

/**
 * Durable SDK session storage backed by Neon/Postgres.
 *
 * Tokens are encrypted before being written to Postgres. The encryption key
 * remains in Vercel and is never stored in the database.
 */
export class NeonSessionStorage extends SessionStorage {
  private clientId = "";
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private sql: ReturnType<typeof neon> | null = null;

  setClientId(clientId: string): void {
    this.clientId = clientId;
  }

  private getSql(): ReturnType<typeof neon> {
    if (!this.sql) this.sql = neon(connectionString());
    return this.sql;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const sql = this.getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS ghl_oauth_sessions (
          application_id TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          encrypted_payload TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (application_id, resource_id)
        )
      `;
      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async disconnect(): Promise<void> {
    // neon() uses stateless HTTP queries; there is no persistent socket to close.
  }

  async createCollection(_collectionName: string): Promise<void> {
    await this.init();
  }

  async getCollection(collectionName: string): Promise<unknown> {
    await this.init();
    return { name: collectionName || TABLE };
  }

  private appId(): string {
    if (!this.clientId) {
      throw new Error("HighLevel OAuth client ID has not been assigned to storage");
    }
    return this.clientId;
  }

  async setSession(resourceId: string, sessionData: ISessionData): Promise<void> {
    await this.init();

    const normalized: ISessionData = {
      ...sessionData,
      expire_at:
        sessionData.expire_at ??
        this.calculateExpireAt(sessionData.expires_in),
    };

    const encrypted = seal(normalized);
    const sql = this.getSql();
    const appId = this.appId();

    await sql`
      INSERT INTO ghl_oauth_sessions (
        application_id,
        resource_id,
        encrypted_payload,
        updated_at
      )
      VALUES (
        ${appId},
        ${resourceId},
        ${encrypted},
        NOW()
      )
      ON CONFLICT (application_id, resource_id)
      DO UPDATE SET
        encrypted_payload = EXCLUDED.encrypted_payload,
        updated_at = NOW()
    `;
  }

  async getSession(resourceId: string): Promise<ISessionData | null> {
    await this.init();

    const sql = this.getSql();
    const appId = this.appId();
    const rows = (await sql`
      SELECT encrypted_payload
      FROM ghl_oauth_sessions
      WHERE application_id = ${appId}
        AND resource_id = ${resourceId}
      LIMIT 1
    `) as unknown as Array<{ encrypted_payload?: unknown }>;

    const payload = rows[0]?.encrypted_payload;
    return typeof payload === "string" ? unseal(payload) : null;
  }

  async deleteSession(resourceId: string): Promise<void> {
    await this.init();

    const sql = this.getSql();
    const appId = this.appId();
    await sql`
      DELETE FROM ghl_oauth_sessions
      WHERE application_id = ${appId}
        AND resource_id = ${resourceId}
    `;
  }

  async getAccessToken(resourceId: string): Promise<string | null> {
    const session = await this.getSession(resourceId);
    return session?.access_token ?? null;
  }

  async getRefreshToken(resourceId: string): Promise<string | null> {
    const session = await this.getSession(resourceId);
    return session?.refresh_token ?? null;
  }

  async getSessionsByApplication(): Promise<ISessionData[]> {
    await this.init();

    const sql = this.getSql();
    const appId = this.appId();
    const rows = (await sql`
      SELECT encrypted_payload
      FROM ghl_oauth_sessions
      WHERE application_id = ${appId}
      ORDER BY updated_at DESC
    `) as unknown as Array<{ encrypted_payload?: unknown }>;

    return rows
      .map((row) =>
        typeof row.encrypted_payload === "string"
          ? unseal(row.encrypted_payload)
          : null,
      )
      .filter((row): row is ISessionData => Boolean(row));
  }
}

let storage: NeonSessionStorage | undefined;

export function getGhlOAuthSessionStorage(): NeonSessionStorage {
  if (!isDurableOAuthStorageConfigured()) {
    throw new Error(
      "Durable HighLevel OAuth storage is not configured. Set GHL_OAUTH_DATABASE_URL and GHL_TOKEN_ENCRYPTION_KEY.",
    );
  }

  if (!storage) storage = new NeonSessionStorage();
  return storage;
}
