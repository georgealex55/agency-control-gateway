import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getCompanyIdInfo } from "@/lib/identity";
import { ghlSdkRequest } from "@/lib/ghl-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function findCompanyId(value: unknown, depth = 0): string | null {
  if (depth > 6 || !value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCompanyId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const obj = value as JsonRecord;
  for (const key of ["companyId", "company_id", "agencyId", "agency_id"]) {
    const candidate = obj[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const nested of Object.values(obj)) {
    const found = findCompanyId(nested, depth + 1);
    if (found) return found;
  }

  return null;
}

/**
 * Protected diagnostic used to discover the agency/company ID without exposing
 * the Private Integration token or returning the complete HighLevel payload.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const identity = getCompanyIdInfo();
  if (identity.companyId) {
    return NextResponse.json({
      ok: true,
      companyId: identity.companyId,
      source: identity.source,
    });
  }

  try {
    // The company search endpoint can return company identity for an agency
    // Private Integration token without exposing the token to the caller.
    const data = await ghlSdkRequest<unknown>({
      method: "GET",
      url: "/companies/",
      headers: { Version: "2021-07-28" },
    });

    const companyId = findCompanyId(data);
    if (!companyId) {
      return NextResponse.json(
        {
          ok: false,
          companyId: null,
          source: "api",
          error: "HighLevel responded, but no company ID was present in the response.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      companyId,
      source: "api",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        companyId: null,
        source: "api",
        error: message,
      },
      { status: 502 },
    );
  }
}
