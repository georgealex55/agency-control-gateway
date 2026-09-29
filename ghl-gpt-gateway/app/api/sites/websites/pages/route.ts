import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { executeSdkReadAction } from "@/lib/ghl-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type R = Record<string, unknown>;

function rec(value: unknown): R | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as R
    : undefined;
}

function arr(value: unknown): unknown[] {
  const root = rec(value);
  const data = rec(root?.data);
  for (const v of [
    root?.pages, root?.funnels, root?.items, root?.results, root?.data,
    data?.pages, data?.funnels, data?.items, data?.results,
  ]) {
    if (Array.isArray(v)) return v;
  }
  return [];
}

function field(item: unknown, names: string[]): string {
  const r = rec(item);
  if (!r) return "";
  for (const name of names) {
    const value = r[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const locationId = url.searchParams.get("locationId")?.trim() || "";
    const funnelIdParam = url.searchParams.get("funnelId")?.trim() || "";
    const websiteName = url.searchParams.get("websiteName")?.trim() || "";
    const pageName = url.searchParams.get("pageName")?.trim() || "";
    const limit = url.searchParams.get("limit") || "50";
    const offset = url.searchParams.get("offset") || "0";

    if (!locationId) {
      return NextResponse.json({ error: "locationId is required" }, { status: 400 });
    }
    if (!funnelIdParam && !websiteName) {
      return NextResponse.json(
        { error: "funnelId or websiteName is required" },
        { status: 400 },
      );
    }

    let funnelId = funnelIdParam;
    let website: unknown = undefined;

    if (!funnelId) {
      const sitesResult = await executeSdkReadAction("list_funnels", {
        locationId,
        type: "website",
        name: websiteName,
        limit: "50",
        offset: "0",
      });

      if (!sitesResult) {
        return NextResponse.json(
          { error: "list_funnels SDK action is unavailable" },
          { status: 501 },
        );
      }

      const sites = arr(sitesResult.data);
      const exact = sites.find((item) =>
        norm(field(item, ["name", "title"])) === norm(websiteName)
      );
      website = exact ?? sites[0];

      if (!website) {
        return NextResponse.json(
          { ok: true, locationId, websiteName, found: false, count: 0, pages: [] },
          { status: 200 },
        );
      }

      funnelId = field(website, ["_id", "id", "funnelId"]);
      if (!funnelId) {
        return NextResponse.json(
          { error: "Website was found but no funnel/site id was returned", website },
          { status: 502 },
        );
      }
    }

    const pagesResult = await executeSdkReadAction("list_funnel_pages", {
      locationId,
      funnelId,
      name: pageName || undefined,
      limit,
      offset,
    });

    if (!pagesResult) {
      return NextResponse.json(
        { error: "list_funnel_pages SDK action is unavailable" },
        { status: 501 },
      );
    }

    let pages = arr(pagesResult.data);
    if (pageName) {
      const needle = norm(pageName);
      pages = pages.filter((item) => {
        const text = [
          field(item, ["name", "title"]),
          field(item, ["slug", "path", "url"]),
        ].join(" ").toLowerCase();
        return text.includes(needle);
      });
    }

    return NextResponse.json({
      ok: true,
      risk: "read",
      transport: "official-sdk",
      locationId,
      websiteName: websiteName || undefined,
      funnelId,
      website,
      count: pages.length,
      pages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 400;

    return NextResponse.json(
      { error: message },
      {
        status:
          Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
            ? statusCode
            : 400,
      },
    );
  }
}
