import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
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

function firstArray(value: unknown): unknown[] {
  const root = rec(value);
  const data = rec(root?.data);

  for (const candidate of [
    root?.funnels,
    root?.pages,
    root?.items,
    root?.results,
    root?.data,
    data?.funnels,
    data?.pages,
    data?.items,
    data?.results,
  ]) {
    if (Array.isArray(candidate)) return candidate;
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

function websiteLike(item: unknown): boolean {
  const r = rec(item);
  if (!r) return false;

  const values = [
    r.type,
    r.category,
    r.kind,
    r.siteType,
    r.funnelType,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => String(value).toLowerCase());

  if (values.length === 0) return true;
  return values.some((value) => value.includes("website") || value === "web");
}

async function listWebsites(locationId: string, name?: string) {
  const result = await executeSdkReadAction("list_funnels", {
    locationId,
    type: "website",
    name: name || undefined,
    limit: "100",
    offset: "0",
  });

  if (!result) throw new Error("list_funnels SDK action is unavailable");

  let websites = firstArray(result.data).filter(websiteLike);

  if (name) {
    const needle = norm(name);
    websites = websites.filter((item) => {
      const haystack = [
        field(item, ["name", "title"]),
        field(item, ["domain", "url", "slug"]),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }

  return websites;
}

async function listWebsitePages(
  locationId: string,
  websiteName?: string,
  funnelIdInput?: string,
  pageName?: string,
) {
  let funnelId = funnelIdInput?.trim() || "";
  let website: unknown = undefined;

  if (!funnelId) {
    if (!websiteName?.trim()) {
      throw new Error("websiteName or funnelId is required");
    }

    const websites = await listWebsites(locationId, websiteName);
    const exact = websites.find(
      (item) => norm(field(item, ["name", "title"])) === norm(websiteName),
    );
    website = exact ?? websites[0];

    if (!website) {
      return { found: false, funnelId: "", website: null, pages: [] as unknown[] };
    }

    funnelId = field(website, ["_id", "id", "funnelId"]);
    if (!funnelId) {
      throw new Error("Website found but no site/funnel id was returned");
    }
  }

  const pagesResult = await executeSdkReadAction("list_funnel_pages", {
    locationId,
    funnelId,
    name: pageName || undefined,
    limit: 100,
    offset: 0,
  });

  if (!pagesResult) throw new Error("list_funnel_pages SDK action is unavailable");

  let pages = firstArray(pagesResult.data);

  if (pageName) {
    const needle = norm(pageName);
    pages = pages.filter((item) =>
      [
        field(item, ["name", "title"]),
        field(item, ["slug", "path", "url"]),
      ].join(" ").toLowerCase().includes(needle),
    );
  }

  return { found: true, funnelId, website: website ?? null, pages };
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "list_websites",
    {
      title: "List HighLevel Websites",
      description:
        "Read-only lookup of Sites > Websites for a specific HighLevel sub-account/location.",
      inputSchema: z.object({
        locationId: z.string().min(1).describe("HighLevel location/sub-account ID"),
        name: z.string().optional().describe("Optional website name filter"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ locationId, name }) => {
      const websites = await listWebsites(locationId, name);
      return {
        structuredContent: {
          locationId,
          query: name ?? null,
          count: websites.length,
          websites,
        },
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { locationId, query: name ?? null, count: websites.length, websites },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_website_pages",
    {
      title: "List HighLevel Website Pages",
      description:
        "Read-only lookup of pages within a HighLevel website. Resolve by website name or site/funnel ID.",
      inputSchema: z.object({
        locationId: z.string().min(1).describe("HighLevel location/sub-account ID"),
        websiteName: z.string().optional().describe("Website name, such as XanderIT"),
        funnelId: z.string().optional().describe("HighLevel site/funnel ID if already known"),
        pageName: z.string().optional().describe("Optional page name/path filter"),
      }).refine(
        (value) => Boolean(value.websiteName?.trim() || value.funnelId?.trim()),
        { message: "websiteName or funnelId is required" },
      ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ locationId, websiteName, funnelId, pageName }) => {
      const result = await listWebsitePages(
        locationId,
        websiteName,
        funnelId,
        pageName,
      );

      const payload = {
        locationId,
        websiteName: websiteName ?? null,
        found: result.found,
        funnelId: result.funnelId || null,
        website: result.website,
        count: result.pages.length,
        pages: result.pages,
      };

      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
});

async function authorizedHandler(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }

  return handler(request);
}

export {
  authorizedHandler as GET,
  authorizedHandler as POST,
  authorizedHandler as DELETE,
};
