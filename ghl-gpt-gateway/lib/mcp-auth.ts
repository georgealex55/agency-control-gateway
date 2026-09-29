import { createRemoteJWKSet, jwtVerify } from "jose";

function cleanIssuer(value: string): string {
  return value.replace(/\/+$/, "");
}

export function oauthIssuer(): string | null {
  const value = process.env.MCP_OAUTH_ISSUER?.trim();
  return value ? cleanIssuer(value) : null;
}

export function oauthAudience(request: Request): string {
  const configured = process.env.MCP_OAUTH_AUDIENCE?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL("/mcp", request.url).toString().replace(/\/+$/, "");
}

export function resourceMetadataUrl(request: Request): string {
  return new URL("/.well-known/oauth-protected-resource", request.url).toString();
}

export function oauthChallenge(request: Request, error = "invalid_token"): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(request)}", error="${error}"`;
}

export async function verifyMcpBearer(request: Request): Promise<boolean> {
  const issuer = oauthIssuer();
  if (!issuer) return false;

  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  try {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    await jwtVerify(match[1], jwks, {
      issuer: `${issuer}/`,
      audience: oauthAudience(request),
    });
    return true;
  } catch {
    return false;
  }
}
