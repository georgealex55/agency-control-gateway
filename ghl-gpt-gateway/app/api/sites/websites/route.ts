import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { executeSdkReadAction } from "@/lib/ghl-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function firstArray(value: unknown): unknown[] {
  const root = asRecord(value);
  const data = asRecord(root?.data);

  const candidates = [
    root?.funnels,
    root?.items,
    root?.results,
    root?.data,
    data?.funnels,
    data?.items,
    data?.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function searchable(item: unknown): string {
  const record = asRecord(item);
  if (!record) return "";

  return [
    record.name,
    record.title,
    record.domain,
    record.url,
    record.slug,
    record.type,
    record.category,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function websiteLike(item: unknown): boolean {
  const record = asRecord(item);
  if (!record) return false;

  const discriminators = [
    record.type,
    record.category,
    record.kind,
    record.siteType,
    record.funnelType,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => String(value).toLowerCase());

  if (discriminators.length === 0) return true;
  return discriminators.some(
    (value) => value.includes("website") || value === "web",
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const locationId = url.searchParams.get("locationId")?.trim() || "";
    const name = url.searchParams.get("name")?.trim() || "";
    const includeAll = url.searchParams.get("includeAll") === "true";
    const limit = url.searchParams.get("limit") || "50";
    const offset = url.searchParams.get("offset") || "0";

    if (!locationId) {
      return NextResponse.json(
        { error: "locationId is required" },
        { status: 400 },
      );
    }

    const result = await executeSdkReadAction("list_funnels", {
      locationId,
      type: "website",
      name: name || undefined,
      limit,
      offset,
    });

    if (!result) {
      return NextResponse.json(
        { error: "list_funnels SDK action is unavailable" },
        { status: 501 },
      );
    }

    const items = firstArray(result.data);
    let websites = includeAll ? items : items.filter(websiteLike);

    if (name) {
      const needle = name.toLowerCase();
      websites = websites.filter((item) => searchable(item).includes(needle));
    }

    return NextResponse.json({
      ok: true,
      risk: "read",
      transport: "official-sdk",
      locationId,
      query: name || null,
      count: websites.length,
      websites,
      rawCount: items.length,
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
