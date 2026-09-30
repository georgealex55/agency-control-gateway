import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { ensureLocationOAuthSession } from "@/lib/ghl-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Protected diagnostic that creates or verifies a durable Location OAuth
 * session without returning any access or refresh token.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const locationId =
      typeof body.locationId === "string" ? body.locationId.trim() : "";

    if (!locationId) {
      return NextResponse.json(
        { ok: false, error: "locationId is required" },
        { status: 400 },
      );
    }

    const result = await ensureLocationOAuthSession(locationId);

    return NextResponse.json({
      ok: true,
      locationId: result.locationId,
      companyId: result.companyId,
      sessionCreated: result.created,
      scopeConfigured: Boolean(result.scope),
      tokenReturned: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown OAuth error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 502 },
    );
  }
}
