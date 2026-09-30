import { NextResponse } from "next/server";
import type { ISessionData } from "@gohighlevel/api-client";
import {
  isLocationOAuthConfigured,
  storeAgencyOAuthSession,
} from "@/lib/ghl-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing OAuth authorization code.",
        expectedCallback: `${url.origin}/api/oauth/callback`,
      },
      { status: 400 },
    );
  }

  const clientId = process.env.GHL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GHL_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = `${url.origin}/api/oauth/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GHL_OAUTH_CLIENT_ID and GHL_OAUTH_CLIENT_SECRET must be configured in Vercel.",
      },
      { status: 500 },
    );
  }

  if (!isLocationOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Durable OAuth storage is not configured. Set GHL_OAUTH_DATABASE_URL and GHL_TOKEN_ENCRYPTION_KEY before installing the Marketplace app.",
      },
      { status: 503 },
    );
  }

  const tokenResponse = await fetch(
    "https://services.leadconnectorhq.com/oauth/token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        user_type: "Company",
        redirect_uri: redirectUri,
      }).toString(),
      cache: "no-store",
    },
  );

  const raw = await tokenResponse.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!tokenResponse.ok) {
    const safeDetails = {
      error: typeof data.error === "string" ? data.error : undefined,
      errorDescription:
        typeof data.error_description === "string"
          ? data.error_description
          : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
      statusCode:
        typeof data.statusCode === "number" ||
        typeof data.statusCode === "string"
          ? data.statusCode
          : undefined,
      traceId:
        typeof data.traceId === "string" ? data.traceId : undefined,
    };

    console.error("HighLevel OAuth token exchange failed", {
      status: tokenResponse.status,
      ...safeDetails,
    });

    return NextResponse.json(
      {
        ok: false,
        status: tokenResponse.status,
        error: "HighLevel OAuth token exchange failed.",
        details: safeDetails,
      },
      { status: tokenResponse.status },
    );
  }

  try {
    const { companyId } = await storeAgencyOAuthSession(
      data as ISessionData,
    );

    return NextResponse.json({
      ok: true,
      companyId,
      userType: data.userType ?? null,
      scope: data.scope ?? null,
      expiresIn: data.expires_in ?? null,
      durableStorage: true,
      tokensReturned: false,
      nextStep:
        "Agency OAuth session stored securely. The gateway can now mint and refresh Location tokens for authorized sub-accounts.",
    });
  } catch (storageError) {
    const message =
      storageError instanceof Error
        ? storageError.message
        : "Unknown OAuth storage error";

    return NextResponse.json(
      {
        ok: false,
        error: "OAuth exchange succeeded but durable token storage failed.",
        details: message,
      },
      { status: 500 },
    );
  }
}
