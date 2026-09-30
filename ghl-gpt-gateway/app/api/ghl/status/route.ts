import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getHighLevelClient } from "@/lib/ghl-client";
import { getCompanyIdInfo } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Protected live SDK diagnostic.
 * Confirms the configured token can make a real HighLevel API request without
 * exposing the token or full account payload.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { companyId, source } = getCompanyIdInfo();
    const ghl = getHighLevelClient();

    const result = await ghl.locations.searchLocations({
      companyId: companyId || undefined,
      limit: "1",
    });

    const locations =
      result && typeof result === "object" && "locations" in result
        ? (result as { locations?: unknown[] }).locations
        : undefined;

    return NextResponse.json({
      ok: true,
      transport: "official-sdk",
      sdkConnected: true,
      companyIdConfigured: Boolean(companyId),
      companyIdSource: source,
      sampleLocationReturned: Array.isArray(locations) && locations.length > 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        transport: "official-sdk",
        sdkConnected: false,
        error: message,
      },
      { status: 502 },
    );
  }
}
