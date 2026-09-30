import { NextResponse } from "next/server";
import { getCompanyIdInfo } from "@/lib/identity";
import { isDurableOAuthStorageConfigured } from "@/lib/ghl-session-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = getCompanyIdInfo();
  const pitConfigured = Boolean(
    process.env.GHL_PRIVATE_INTEGRATION_TOKEN,
  );
  const oauthConfigured = Boolean(
    process.env.GHL_OAUTH_CLIENT_ID &&
      process.env.GHL_OAUTH_CLIENT_SECRET,
  );

  return NextResponse.json({
    ok: true,
    service: "ghl-gpt-gateway",
    version: "2.3.0",
    sdk: {
      installed: true,
      package: "@gohighlevel/api-client",
      mode:
        pitConfigured && oauthConfigured
          ? "hybrid-agency-pit-location-oauth"
          : pitConfigured
            ? "private-integration"
            : oauthConfigured
              ? "oauth"
              : "unconfigured",
    },
    companyIdConfigured: Boolean(identity.companyId),
    companyIdSource: identity.source,
    oauthConfigured,
    durableOAuthStorageConfigured:
      isDurableOAuthStorageConfigured(),
  });
}
