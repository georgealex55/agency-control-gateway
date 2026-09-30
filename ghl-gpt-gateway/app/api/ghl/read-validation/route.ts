import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { executeSdkReadAction } from "@/lib/ghl-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type Check = {
  action: string;
  ok: boolean;
  status?: number;
  itemCount?: number;
  skipped?: boolean;
  error?: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function findCollection(value: unknown, key: string, depth = 0): unknown[] | null {
  if (depth > 5 || value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCollection(item, key, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const obj = asRecord(value);
  if (!obj) return null;

  if (Array.isArray(obj[key])) return obj[key] as unknown[];

  for (const nested of Object.values(obj)) {
    const found = findCollection(nested, key, depth + 1);
    if (found) return found;
  }

  return null;
}

function firstIdFromCollection(value: unknown, key: string): string | null {
  const items = findCollection(value, key);
  if (!items?.length) return null;

  const first = asRecord(items[0]);
  if (!first) return null;

  for (const field of ["id", "_id"]) {
    const value = first[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

async function runRead(
  action: string,
  payload: JsonRecord,
  collectionKey?: string,
): Promise<{ check: Check; data?: unknown }> {
  try {
    const result = await executeSdkReadAction(action, payload);

    if (!result) {
      return {
        check: {
          action,
          ok: false,
          error: "Action is not currently routed through the official SDK",
        },
      };
    }

    const items = collectionKey ? findCollection(result.data, collectionKey) : null;

    return {
      check: {
        action,
        ok: result.ok,
        status: result.status,
        itemCount: items ? items.length : undefined,
      },
      data: result.data,
    };
  } catch (error) {
    return {
      check: {
        action,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Protected read-only SDK validation.
 *
 * Exercises the already-migrated read actions without returning full HighLevel
 * account payloads. This is intended for preview validation before promotion.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: Check[] = [];

  const locations = await runRead("list_locations", { limit: 5 }, "locations");
  checks.push(locations.check);

  const locationId = firstIdFromCollection(locations.data, "locations");
  if (!locationId) {
    return NextResponse.json(
      {
        ok: false,
        transport: "official-sdk",
        checks,
        stopped: "No location was returned, so location-scoped checks could not run.",
      },
      { status: 502 },
    );
  }

  const workflows = await runRead(
    "list_workflows",
    { locationId },
    "workflows",
  );
  checks.push(workflows.check);

  const funnels = await runRead(
    "list_funnels",
    { locationId, limit: 10, offset: 0 },
    "funnels",
  );
  checks.push(funnels.check);

  const blogs = await runRead(
    "list_blogs",
    { locationId, limit: 10, skip: 0 },
    "blogs",
  );
  checks.push(blogs.check);

  const socialAccounts = await runRead(
    "list_social_accounts",
    { locationId },
    "accounts",
  );
  checks.push(socialAccounts.check);

  const funnelId = firstIdFromCollection(funnels.data, "funnels");
  if (funnelId) {
    const funnelPages = await runRead(
      "list_funnel_pages",
      { locationId, funnelId, limit: 10, offset: 0 },
      "pages",
    );
    checks.push(funnelPages.check);
  } else {
    checks.push({
      action: "list_funnel_pages",
      ok: true,
      skipped: true,
      error: "Skipped because no funnel identifier was returned for the sample location.",
    });
  }

  const failed = checks.filter((check) => !check.ok);

  return NextResponse.json(
    {
      ok: failed.length === 0,
      transport: "official-sdk",
      readOnly: true,
      checks,
      passed: checks.filter((check) => check.ok && !check.skipped).length,
      skipped: checks.filter((check) => check.skipped).length,
      failed: failed.length,
    },
    { status: failed.length === 0 ? 200 : 502 },
  );
}
