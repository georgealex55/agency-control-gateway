import HighLevel, {
  LogLevel,
  type ISessionData,
} from "@gohighlevel/api-client";
import { getCompanyIdInfo } from "@/lib/identity";
import {
  getGhlOAuthSessionStorage,
  isDurableOAuthStorageConfigured,
} from "@/lib/ghl-session-storage";

let oauthClient: HighLevel | undefined;

function oauthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GHL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GHL_OAUTH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "GHL_OAUTH_CLIENT_ID and GHL_OAUTH_CLIENT_SECRET are required for location OAuth",
    );
  }

  return { clientId, clientSecret };
}

export function isLocationOAuthConfigured(): boolean {
  return Boolean(
    process.env.GHL_OAUTH_CLIENT_ID &&
      process.env.GHL_OAUTH_CLIENT_SECRET &&
      isDurableOAuthStorageConfigured(),
  );
}

export function getOAuthHighLevelClient(): HighLevel {
  const { clientId, clientSecret } = oauthCredentials();
  const sessionStorage = getGhlOAuthSessionStorage();
  sessionStorage.setClientId(clientId);

  if (!oauthClient) {
    oauthClient = new HighLevel({
      clientId,
      clientSecret,
      sessionStorage,
      logLevel: LogLevel.WARN,
      rateLimitRetry: true,
    });
  }

  return oauthClient;
}

export async function storeAgencyOAuthSession(
  session: ISessionData,
): Promise<{ companyId: string }> {
  const { clientId } = oauthCredentials();
  const storage = getGhlOAuthSessionStorage();
  storage.setClientId(clientId);

  const companyId =
    typeof session.companyId === "string" ? session.companyId.trim() : "";

  if (!companyId) {
    throw new Error("HighLevel OAuth response did not include companyId");
  }

  const configuredCompanyId = getCompanyIdInfo().companyId;
  if (configuredCompanyId && configuredCompanyId !== companyId) {
    throw new Error(
      "OAuth installation companyId does not match configured GHL_COMPANY_ID",
    );
  }

  if (!session.access_token || !session.refresh_token) {
    throw new Error(
      "HighLevel OAuth response did not include both access and refresh tokens",
    );
  }

  await storage.setSession(companyId, {
    ...session,
    companyId,
    userType: session.userType || "Company",
  });

  return { companyId };
}

export async function getAgencyOAuthSession(): Promise<ISessionData | null> {
  const { clientId } = oauthCredentials();
  const storage = getGhlOAuthSessionStorage();
  storage.setClientId(clientId);

  const { companyId } = getCompanyIdInfo();
  if (!companyId) return null;

  return storage.getSession(companyId);
}

/**
 * Ensures there is a durable location OAuth session for the requested
 * sub-account. If one does not exist yet, an Agency OAuth token is exchanged
 * for a Location token and the resulting access/refresh pair is persisted.
 */
export async function ensureLocationOAuthSession(
  locationId: string,
): Promise<{
  locationId: string;
  companyId: string;
  created: boolean;
  scope?: string;
}> {
  const id = locationId.trim();
  if (!id) throw new Error("locationId is required");

  const { clientId } = oauthCredentials();
  const storage = getGhlOAuthSessionStorage();
  storage.setClientId(clientId);
  await storage.init();

  const { companyId } = getCompanyIdInfo();
  if (!companyId) {
    throw new Error("GHL_COMPANY_ID is required for Agency to Location OAuth");
  }

  const existing = await storage.getSession(id);
  if (existing?.access_token) {
    return {
      locationId: id,
      companyId,
      created: false,
      scope: existing.scope,
    };
  }

  const agencySession = await storage.getSession(companyId);
  if (!agencySession?.access_token) {
    throw new Error(
      "Agency OAuth session is not stored. Reinstall the HighLevel Marketplace app after durable OAuth storage is configured.",
    );
  }

  const ghl = getOAuthHighLevelClient();
  const locationToken = await ghl.oauth.getLocationAccessToken({
    companyId,
    locationId: id,
  });

  if (!locationToken.access_token) {
    throw new Error(
      "HighLevel did not return a Location access token for this sub-account",
    );
  }

  await storage.setSession(id, {
    ...(locationToken as ISessionData),
    companyId,
    locationId: id,
    userType: "Location",
  });

  return {
    locationId: id,
    companyId,
    created: true,
    scope: locationToken.scope,
  };
}

export async function removeLocationOAuthSession(
  locationId: string,
): Promise<void> {
  const { clientId } = oauthCredentials();
  const storage = getGhlOAuthSessionStorage();
  storage.setClientId(clientId);
  await storage.deleteSession(locationId.trim());
}
