import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { isAuthorized } from "@/lib/auth";
import { executeSdkReadAction, executeSdkWriteAction } from "@/lib/ghl-actions";
import { oauthChallenge, verifyMcpBearer } from "@/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type R = Record<string, unknown>;

function rec(value: unknown): R | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as R
    : undefined;
}

function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const root = rec(value);
  const data = rec(root?.data);

  for (const candidate of [
    root?.locations,
    root?.funnels,
    root?.pages,
    root?.funnelPages,
    root?.workflows,
    root?.blogs,
    root?.posts,
    root?.items,
    root?.results,
    root?.data,
    data?.locations,
    data?.funnels,
    data?.pages,
    data?.funnelPages,
    data?.workflows,
    data?.blogs,
    data?.posts,
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

type HtmlBlock = {
  path: string;
  id: string | null;
  type: string | null;
  html: string;
};

function extractCustomHtmlBlocks(value: unknown): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  const seen = new Set<string>();
  const parsedJsonStrings = new Set<string>();

  function looksLikeHtml(text: string): boolean {
    return /<!doctype\s+html|<html\b|<style\b|<script\b|<(?:div|section|main|header|footer|nav|article|aside|form|img|svg|canvas|iframe|p|h[1-6]|a|button|input)\b/i.test(text);
  }

  function addBlock(
    candidate: string,
    path: string,
    r?: R,
    type?: string,
  ): void {
    const text = candidate.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    blocks.push({
      path,
      id: r ? field(r, ["id", "_id", "elementId"]) || null : null,
      type: type || null,
      html: candidate,
    });
  }

  function walk(node: unknown, path: string, customAncestor = false): void {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`, customAncestor));
      return;
    }

    const r = rec(node);
    if (!r) return;

    const type = field(r, ["type", "elementType", "componentType", "kind", "name"]);
    const codeType = field(r, ["codeType", "language", "contentType"]);
    const looksCustom =
      customAncestor ||
      /custom[ _-]?(code|html)|customcode|customhtml|code element|html element/i.test(type) ||
      /html/i.test(codeType);

    for (const [key, child] of Object.entries(r)) {
      const childPath = path ? `${path}.${key}` : key;

      if (typeof child === "string") {
        const text = child.trim();
        const keySuggestsCode = /html|code|markup|source|content|value|body/i.test(key);

        if (
          text &&
          (looksCustom || (keySuggestsCode && looksLikeHtml(text)) || (text.length >= 200 && looksLikeHtml(text)))
        ) {
          addBlock(child, childPath, r, type);
        }

        if (
          text.length >= 50 &&
          text.length <= 2_000_000 &&
          (text.startsWith("{") || text.startsWith("[")) &&
          !parsedJsonStrings.has(text)
        ) {
          try {
            const parsed = JSON.parse(text);
            parsedJsonStrings.add(text);
            walk(parsed, `${childPath}(json)`, looksCustom);
          } catch {
            // Not JSON; leave it as a normal string.
          }
        }
      } else if (typeof child === "object" && child !== null) {
        walk(child, childPath, looksCustom);
      }
    }
  }

  walk(value, "data");
  return blocks;
}

function builderDiagnostic(value: unknown) {
  const strings: Array<{ path: string; length: number; preview: string }> = [];

  function walk(node: unknown, path: string, depth: number): void {
    if (depth > 7 || strings.length > 100) return;
    if (Array.isArray(node)) {
      node.slice(0, 50).forEach((child, index) => walk(child, `${path}[${index}]`, depth + 1));
      return;
    }

    const r = rec(node);
    if (!r) return;

    for (const [key, child] of Object.entries(r)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === "string" && child.length >= 80) {
        strings.push({
          path: childPath,
          length: child.length,
          preview: child.slice(0, 160),
        });
      } else if (typeof child === "object" && child !== null) {
        walk(child, childPath, depth + 1);
      }
    }
  }

  walk(value, "data", 0);
  strings.sort((a, b) => b.length - a.length);

  const root = rec(value);
  return {
    rootType: Array.isArray(value) ? "array" : typeof value,
    topLevelKeys: root ? Object.keys(root).slice(0, 30) : [],
    largestStrings: strings.slice(0, 12),
  };
}

async function pageHtmlPayload(locationId: string, page: unknown) {
  const pageId = field(page, ["id", "_id", "pageId"]);
  if (!pageId) return null;

  const data = await runRead("get_funnel_page_data", { locationId, pageId });
  const blocks = extractCustomHtmlBlocks(data);

  return {
    pageId,
    name: field(page, ["name", "title"]) || null,
    url: field(page, ["url", "path", "slug"]) || null,
    blockCount: blocks.length,
    blocks,
    diagnostic: blocks.length === 0 ? builderDiagnostic(data) : undefined,
  };
}

function resultPayload(action: string, data: unknown) {
  const items = firstArray(data);
  return { action, count: items.length, items, data };
}

function websiteLike(item: unknown): boolean {
  const r = rec(item);
  if (!r) return false;

  const values = [r.type, r.category, r.kind, r.siteType, r.funnelType]
    .filter((value) => typeof value === "string")
    .map((value) => String(value).toLowerCase());

  if (values.length === 0) return true;
  return values.some((value) => value.includes("website") || value === "web");
}

async function runRead(action: string, payload: Record<string, unknown>) {
  const result = await executeSdkReadAction(action, payload);
  if (!result) throw new Error(`${action} SDK action is unavailable`);
  return result.data;
}

async function runWrite(action: string, payload: Record<string, unknown>) {
  const result = await executeSdkWriteAction(action, payload);
  if (!result) throw new Error(`${action} SDK action is unavailable`);
  return result.data;
}

async function listWebsites(locationId: string, name?: string) {
  const data = await runRead("list_funnels", {
    locationId,
    type: "website",
    name: name || undefined,
    limit: "100",
    offset: "0",
  });

  let websites = firstArray(data).filter(websiteLike);

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
    if (!websiteName?.trim()) throw new Error("websiteName or funnelId is required");

    const websites = await listWebsites(locationId, websiteName);
    const exact = websites.find(
      (item) => norm(field(item, ["name", "title"])) === norm(websiteName),
    );
    website = exact ?? websites[0];

    if (!website) {
      return { found: false, funnelId: "", website: null, pages: [] as unknown[], html: [] as unknown[] };
    }

    funnelId = field(website, ["_id", "id", "funnelId"]);
    if (!funnelId) throw new Error("Website found but no site/funnel id was returned");
  }

  const data = await runRead("list_funnel_pages", {
    locationId,
    funnelId,
    name: pageName || undefined,
    limit: 20,
    offset: 0,
  });

  let pages = firstArray(data);
  if (pageName) {
    const needle = norm(pageName);
    pages = pages.filter((item) =>
      [
        field(item, ["name", "title"]),
        field(item, ["slug", "path", "url"]),
      ].join(" ").toLowerCase().includes(needle),
    );
  }

  const html =
    pageName && pages.length > 0
      ? (await Promise.all(pages.slice(0, 5).map((page) => pageHtmlPayload(locationId, page))))
          .filter(Boolean)
      : [];

  return { found: true, funnelId, website: website ?? null, pages, html };
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const handler = createMcpHandler((server) => {
  server.registerTool(
    "list_locations",
    {
      title: "List HighLevel Locations",
      description:
        "Read-only listing of HighLevel agency sub-accounts/locations. Use this to find a location ID before querying its sites or CRM resources.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        skip: z.number().int().min(0).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ limit, skip }) => {
      const data = await runRead("list_locations", { limit: limit ?? 100, skip });
      const payload = resultPayload("list_locations", data);
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_websites",
    {
      title: "List HighLevel Websites",
      description:
        "Read-only lookup of Sites > Websites for a specific HighLevel sub-account/location.",
      inputSchema: z.object({
        locationId: z.string().min(1),
        name: z.string().optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ locationId, name }) => {
      const websites = await listWebsites(locationId, name);
      const payload = { locationId, query: name ?? null, count: websites.length, websites };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_website_pages",
    {
      title: "List HighLevel Website Pages",
      description:
        "Read-only lookup of pages inside a HighLevel website. Resolve the website by name or by its site/funnel ID.",
      inputSchema: z.object({
        locationId: z.string().min(1),
        websiteName: z.string().optional(),
        funnelId: z.string().optional(),
        pageName: z.string().optional(),
      }).refine(
        (value) => Boolean(value.websiteName?.trim() || value.funnelId?.trim()),
        { message: "websiteName or funnelId is required" },
      ),
      annotations: readOnlyAnnotations,
    },
    async ({ locationId, websiteName, funnelId, pageName }) => {
      const result = await listWebsitePages(locationId, websiteName, funnelId, pageName);
      const payload = {
        locationId,
        websiteName: websiteName ?? null,
        found: result.found,
        funnelId: result.funnelId || null,
        website: result.website,
        count: result.pages.length,
        pages: result.pages,
        customHtml: result.html,
      };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_website_page_html",
    {
      title: "Get HighLevel Website Page Custom HTML",
      description:
        "Read-only extraction of Custom HTML/Custom Code blocks from one HighLevel website page. Use a known page ID for the most precise lookup.",
      inputSchema: z.object({
        locationId: z.string().min(1),
        pageId: z.string().min(1),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ locationId, pageId }) => {
      const data = await runRead("get_funnel_page_data", { locationId, pageId });
      const blocks = extractCustomHtmlBlocks(data);
      const payload = {
        locationId,
        pageId,
        blockCount: blocks.length,
        blocks,
        diagnostic: blocks.length === 0 ? builderDiagnostic(data) : undefined,
      };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "update_website_page_html",
    {
      title: "Update HighLevel Website Page Custom HTML",
      description:
        "Guarded update for the existing rawCustomCode element on one HighLevel page. Defaults to dry-run. Live writes require dryRun=false, confirmWrite=true, and the server feature flag ALLOW_GHL_PAGE_BUILDER_WRITE=true.",
      inputSchema: z.object({
        locationId: z.string().min(1),
        pageId: z.string().min(1),
        html: z.string().min(1).max(2_000_000),
        targetPath: z.string().optional(),
        expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
        dryRun: z.boolean().optional(),
        confirmWrite: z.boolean().optional(),
      }),
      annotations: writeAnnotations,
    },
    async ({
      locationId,
      pageId,
      html,
      targetPath,
      expectedSha256,
      dryRun,
      confirmWrite,
    }) => {
      const data = await runWrite("update_website_page_html", {
        locationId,
        pageId,
        html,
        targetPath,
        expectedSha256,
        dryRun: dryRun ?? true,
        confirmWrite: confirmWrite ?? false,
      });
      const payload = {
        locationId,
        pageId,
        ...rec(data),
      };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_funnels",
    {
      title: "List HighLevel Funnels",
      description:
        "Read-only listing of funnels for a specific HighLevel location. Use this for funnel discovery, not websites.",
      inputSchema: z.object({
        locationId: z.string().min(1),
        name: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ locationId, name, category, limit, offset }) => {
      const data = await runRead("list_funnels", {
        locationId,
        type: "funnel",
        name,
        category,
        limit: limit ?? 50,
        offset: offset ?? 0,
      });
      const payload = { locationId, ...resultPayload("list_funnels", data) };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_workflows",
    {
      title: "List HighLevel Workflows",
      description: "Read-only listing of workflows in a HighLevel location/sub-account.",
      inputSchema: z.object({ locationId: z.string().min(1) }),
      annotations: readOnlyAnnotations,
    },
    async ({ locationId }) => {
      const data = await runRead("list_workflows", { locationId });
      const payload = { locationId, ...resultPayload("list_workflows", data) };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_blogs",
    {
      title: "List HighLevel Blogs",
      description: "Read-only listing of blogs in a HighLevel location/sub-account.",
      inputSchema: z.object({
        locationId: z.string().min(1),
        searchTerm: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        skip: z.number().int().min(0).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ locationId, searchTerm, limit, skip }) => {
      const data = await runRead("list_blogs", {
        locationId,
        searchTerm,
        limit: limit ?? 50,
        skip: skip ?? 0,
      });
      const payload = { locationId, ...resultPayload("list_blogs", data) };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_blog_posts",
    {
      title: "List HighLevel Blog Posts",
      description: "Read-only listing of posts inside a specific HighLevel blog.",
      inputSchema: z.object({
        locationId: z.string().min(1),
        blogId: z.string().min(1),
        searchTerm: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ locationId, blogId, searchTerm, status, limit, offset }) => {
      const data = await runRead("list_blog_posts", {
        locationId,
        blogId,
        searchTerm,
        status: status ?? "ALL",
        limit: limit ?? 50,
        offset: offset ?? 0,
      });
      const payload = { locationId, blogId, ...resultPayload("list_blog_posts", data) };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
});

async function authorizedHandler(request: Request): Promise<Response> {
  if (isAuthorized(request) || await verifyMcpBearer(request)) {
    return handler(request);
  }

  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": oauthChallenge(request),
        "cache-control": "no-store",
      },
    },
  );
}

export {
  authorizedHandler as GET,
  authorizedHandler as POST,
  authorizedHandler as DELETE,
};
