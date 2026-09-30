import { getCompanyIdInfo } from "@/lib/identity";

const DEFAULT_BASE = "https://services.leadconnectorhq.com";

export type RiskLevel = "read" | "write" | "destructive";

type Rule = {
  method: string;
  pattern: RegExp;
  version: string;
  risk: RiskLevel;
};

const RULES: Rule[] = [
  // Agency / location discovery
  { method: "GET", pattern: /^\/companies\/[A-Za-z0-9_-]+$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/locations\/search(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/locations\/[A-Za-z0-9_-]+$/, version: "v3", risk: "read" },

  // Contacts
  { method: "GET", pattern: /^\/contacts\/?(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "POST", pattern: /^\/contacts\/?$/, version: "v3", risk: "write" },
  { method: "POST", pattern: /^\/contacts\/search$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/contacts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "read" },
  { method: "PUT", pattern: /^\/contacts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "write" },
  { method: "DELETE", pattern: /^\/contacts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "destructive" },
  { method: "POST", pattern: /^\/contacts\/[A-Za-z0-9_-]+\/workflow\/[A-Za-z0-9_-]+$/, version: "v3", risk: "write" },
  { method: "DELETE", pattern: /^\/contacts\/[A-Za-z0-9_-]+\/workflow\/[A-Za-z0-9_-]+$/, version: "v3", risk: "destructive" },

  // Opportunities / pipelines
  { method: "GET", pattern: /^\/opportunities\/search(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/opportunities\/pipelines(?:\?.*)?$/, version: "2021-07-28", risk: "read" },
  { method: "POST", pattern: /^\/opportunities\/?$/, version: "2021-07-28", risk: "write" },
  { method: "PUT", pattern: /^\/opportunities\/[A-Za-z0-9_-]+$/, version: "2021-07-28", risk: "write" },
  { method: "DELETE", pattern: /^\/opportunities\/[A-Za-z0-9_-]+$/, version: "2021-07-28", risk: "destructive" },

  // Conversations / messages
  { method: "GET", pattern: /^\/conversations\/search(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/conversations\/[A-Za-z0-9_-]+$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/conversations\/[A-Za-z0-9_-]+\/messages(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "POST", pattern: /^\/conversations\/messages$/, version: "v3", risk: "write" },

  // Workflows: HighLevel public API currently exposes workflow listing/read.
  { method: "GET", pattern: /^\/workflows\/?(?:\?.*)?$/, version: "v3", risk: "read" },

  // Social Planner
  { method: "GET", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/accounts$/, version: "v3", risk: "read" },
  { method: "POST", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/posts\/list$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/posts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "read" },
  { method: "POST", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/posts$/, version: "v3", risk: "write" },
  { method: "PUT", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/posts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "write" },
  { method: "PATCH", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/posts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "write" },
  { method: "DELETE", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/posts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "destructive" },
  { method: "GET", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/categories(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/social-media-posting\/[A-Za-z0-9_-]+\/tags(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "POST", pattern: /^\/social-media-posting\/statistics$/, version: "v3", risk: "read" },

  // Blogs
  { method: "GET", pattern: /^\/blogs\/site\/all(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/blogs\/posts\/all(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/blogs\/posts\/post\/[A-Za-z0-9_-]+(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/blogs\/posts\/url-slug-exists(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/blogs\/categories(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "GET", pattern: /^\/blogs\/authors(?:\?.*)?$/, version: "v3", risk: "read" },
  { method: "POST", pattern: /^\/blogs\/posts$/, version: "v3", risk: "write" },
  { method: "PUT", pattern: /^\/blogs\/posts\/[A-Za-z0-9_-]+$/, version: "v3", risk: "write" },

  // Funnels/sites: HighLevel moved funnel/page discovery reads to v4 on 2026-09-18.
  // The public API still exposes metadata only, not visual builder/custom-HTML source editing.
  { method: "GET", pattern: /^\/funnels\/funnel(?:\?.*)?$/, version: "v4", risk: "read" },
  { method: "GET", pattern: /^\/funnels\/funnel\/[A-Za-z0-9_-]+\/pages(?:\?.*)?$/, version: "v4", risk: "read" },
  { method: "GET", pattern: /^\/funnels\/funnel\/[A-Za-z0-9_-]+\/pages\/count(?:\?.*)?$/, version: "v4", risk: "read" },
  { method: "GET", pattern: /^\/funnels\/lookup\/redirect(?:\?.*)?$/, version: "v4", risk: "read" },
  { method: "POST", pattern: /^\/funnels\/lookup\/redirect$/, version: "v3", risk: "write" },
  { method: "PATCH", pattern: /^\/funnels\/lookup\/redirect\/[A-Za-z0-9_-]+$/, version: "v3", risk: "write" },
  { method: "DELETE", pattern: /^\/funnels\/lookup\/redirect\/[A-Za-z0-9_-]+$/, version: "v3", risk: "destructive" },
];

function resolveRule(method: string, path: string): Rule | undefined {
  return RULES.find((r) => r.method === method && r.pattern.test(path));
}

function destructiveEnabled() {
  return String(process.env.ALLOW_DESTRUCTIVE_ACTIONS || "false").toLowerCase() === "true";
}

export async function ghlRequest(input: {
  method: string;
  path: string;
  body?: unknown;
  confirmDestructive?: boolean;
}) {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN is not configured");

  const method = input.method.toUpperCase();
  let path = input.path.trim();
  if (!path.startsWith("/")) path = `/${path}`;

  if (path.includes("://") || path.includes("..")) {
    throw new Error("Invalid HighLevel path");
  }

  const rule = resolveRule(method, path);
  if (!rule) throw new Error(`Route not allowlisted: ${method} ${path}`);

  if (rule.risk === "destructive" && (!destructiveEnabled() || !input.confirmDestructive)) {
    throw new Error("Destructive action blocked. Set ALLOW_DESTRUCTIVE_ACTIONS=true and pass confirmDestructive=true.");
  }

  if (path.startsWith("/locations/search")) {
    const [pathname, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    if (!params.has("companyId")) {
      const { companyId } = getCompanyIdInfo();
      if (!companyId) {
        throw new Error("Unable to determine HighLevel Company ID from GHL_COMPANY_ID or the Private Integration token.");
      }
      params.set("companyId", companyId);
    }
    path = `${pathname}?${params.toString()}`;
  }

  const base = process.env.GHL_API_BASE || DEFAULT_BASE;
  const url = `${base.replace(/\/$/, "")}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    Version: rule.version,
  };

  const init: RequestInit = { method, headers, cache: "no-store" };
  if (input.body !== undefined && !["GET", "HEAD"].includes(method)) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  return { status: response.status, ok: response.ok, risk: rule.risk, data };
}
