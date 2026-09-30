import { NextResponse } from "next/server";
import {
  getAgencyOAuthSession,
  isLocationOAuthConfigured,
} from "@/lib/ghl-oauth";
import { isDurableOAuthStorageConfigured } from "@/lib/ghl-session-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/oauth/callback`;
  const configuredRedirectUri =
    process.env.GHL_OAUTH_REDIRECT_URI?.trim() || null;

  const oauthConfigured = Boolean(
    process.env.GHL_OAUTH_CLIENT_ID &&
      process.env.GHL_OAUTH_CLIENT_SECRET,
  );
  const durableStorageConfigured = isDurableOAuthStorageConfigured();

  let agencySessionStored = false;
  if (oauthConfigured && durableStorageConfigured) {
    try {
      agencySessionStored = Boolean(
        (await getAgencyOAuthSession())?.access_token,
      );
    } catch {
      agencySessionStored = false;
    }
  }

  const nextStep =
    !oauthConfigured
      ? "Configure HighLevel OAuth client credentials."
      : !durableStorageConfigured
        ? "Configure GHL_OAUTH_DATABASE_URL and GHL_TOKEN_ENCRYPTION_KEY for this deployment environment."
        : !agencySessionStored
          ? "Install or reinstall the HighLevel Marketplace app to store the Company OAuth session."
          : configuredRedirectUri && configuredRedirectUri !== redirectUri
            ? "OAuth is ready, but GHL_OAUTH_REDIRECT_URI does not match this deployment callback."
            : "OAuth is ready. Generate a Location session or run validation.";

  return NextResponse.json({
    ok: true,
    nextStep,
    oauthConfigured,
    durableStorageConfigured,
    locationOAuthReady:
      isLocationOAuthConfigured() && agencySessionStored,
    agencySessionStored,
    redirectUri,
    configuredRedirectUri,
    configuredRedirectUriMatchesRuntime:
      !configuredRedirectUri || configuredRedirectUri === redirectUri,
    clientIdConfigured: Boolean(process.env.GHL_OAUTH_CLIENT_ID),
    clientSecretConfigured: Boolean(process.env.GHL_OAUTH_CLIENT_SECRET),
    tokenEncryptionConfigured: Boolean(
      process.env.GHL_TOKEN_ENCRYPTION_KEY,
    ),
    oauthDatabaseConfigured: Boolean(
      process.env.GHL_OAUTH_DATABASE_URL || process.env.DATABASE_URL,
    ),
  });
}
