import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { ghlRequest } from "@/lib/ghl";
import { executeSdkReadAction, executeSdkWriteAction } from "@/lib/ghl-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;

function reqString(p: Payload, key: string): string {
  const value = p[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function errorStatus(error: unknown): number {
  if (error && typeof error === "object" && "statusCode" in error) {
    const status = Number((error as { statusCode?: unknown }).statusCode);
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      return status;
    }
  }
  return 400;
}

function query(params: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const p = await request.json() as Payload;
    const action = reqString(p, "action");
    const locationId = typeof p.locationId === "string" ? p.locationId.trim() : "";
    const body = p.body;
    const confirmDestructive = p.confirmDestructive === true;

    let call: { method: string; path: string; body?: unknown; confirmDestructive?: boolean };

    switch (action) {
      case "list_locations":
        call = { method: "GET", path: `/locations/search${query({ limit: p.limit ?? 100, skip: p.skip })}` };
        break;
      case "list_social_accounts":
        call = { method: "GET", path: `/social-media-posting/${reqString(p, "locationId")}/accounts` };
        break;
      case "list_social_posts":
        call = { method: "POST", path: `/social-media-posting/${reqString(p, "locationId")}/posts/list`, body: body ?? { type: "all", skip: "0", limit: "20" } };
        break;
      case "get_social_post":
        call = { method: "GET", path: `/social-media-posting/${reqString(p, "locationId")}/posts/${reqString(p, "id")}` };
        break;
      case "create_social_post":
        call = { method: "POST", path: `/social-media-posting/${reqString(p, "locationId")}/posts`, body };
        break;
      case "update_social_post":
        call = { method: "PUT", path: `/social-media-posting/${reqString(p, "locationId")}/posts/${reqString(p, "id")}`, body };
        break;
      case "delete_social_post":
        call = { method: "DELETE", path: `/social-media-posting/${reqString(p, "locationId")}/posts/${reqString(p, "id")}`, confirmDestructive };
        break;
      case "list_blogs":
        call = { method: "GET", path: `/blogs/site/all${query({ locationId: reqString(p, "locationId"), skip: p.skip ?? 0, limit: p.limit ?? 50, searchTerm: p.searchTerm })}` };
        break;
      case "list_blog_posts":
        call = { method: "GET", path: `/blogs/posts/all${query({ locationId: reqString(p, "locationId"), blogId: reqString(p, "blogId"), limit: p.limit ?? 50, offset: p.offset ?? 0, searchTerm: p.searchTerm, status: p.status ?? "ALL" })}` };
        break;
      case "get_blog_post":
        call = { method: "GET", path: `/blogs/posts/post/${reqString(p, "id")}${query({ locationId: reqString(p, "locationId") })}` };
        break;
      case "create_blog_post":
        call = { method: "POST", path: "/blogs/posts", body };
        break;
      case "update_blog_post":
        call = { method: "PUT", path: `/blogs/posts/${reqString(p, "id")}`, body };
        break;
      case "list_workflows":
        call = { method: "GET", path: `/workflows/${query({ locationId: reqString(p, "locationId") })}` };
        break;
      case "add_contact_to_workflow":
        call = { method: "POST", path: `/contacts/${reqString(p, "contactId")}/workflow/${reqString(p, "workflowId")}`, body: body ?? {} };
        break;
      case "remove_contact_from_workflow":
        call = { method: "DELETE", path: `/contacts/${reqString(p, "contactId")}/workflow/${reqString(p, "workflowId")}`, confirmDestructive };
        break;
      case "list_funnels":
        call = { method: "GET", path: `/funnels/funnel/list${query({ locationId: reqString(p, "locationId"), type: p.type, category: p.category, offset: p.offset ?? 0, limit: p.limit ?? 50, parentId: p.parentId, name: p.name })}` };
        break;
      case "list_funnel_pages":
        call = { method: "GET", path: `/funnels/page${query({ locationId: reqString(p, "locationId"), funnelId: reqString(p, "funnelId"), name: p.name, limit: p.limit ?? 50, offset: p.offset ?? 0 })}` };
        break;
      case "list_redirects":
        call = { method: "GET", path: `/funnels/lookup/redirect/list${query({ locationId: reqString(p, "locationId"), limit: p.limit ?? 50, skip: p.skip ?? 0 })}` };
        break;
      case "create_redirect":
        call = { method: "POST", path: "/funnels/lookup/redirect", body };
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    const sdkResult =
      (await executeSdkReadAction(action, p)) ??
      (await executeSdkWriteAction(action, p));
    const result = sdkResult ?? await ghlRequest(call);
    return NextResponse.json(
      {
        action,
        locationId: locationId || undefined,
        transport: sdkResult ? "official-sdk" : "legacy-rest",
        ...result,
      },
      { status: result.ok ? 200 : result.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: errorStatus(error) },
    );
  }
}
