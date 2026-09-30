import { NextResponse } from "next/server";
import { oauthAudience, oauthIssuer } from "@/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const issuer = oauthIssuer();

  if (!issuer) {
    return NextResponse.json(
      {
        error: "MCP OAuth is not configured",
        requiredEnv: ["MCP_OAUTH_ISSUER", "MCP_OAUTH_AUDIENCE"],
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      resource: oauthAudience(request),
      authorization_servers: [issuer],
      scopes_supported: ["ghl.read"],
      bearer_methods_supported: ["header"],
      resource_name: "GHL Agency Gateway",
      resource_documentation: new URL("/", request.url).toString(),
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
    },
  });
}
