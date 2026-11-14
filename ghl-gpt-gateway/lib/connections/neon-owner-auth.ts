import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Personal staging owner gate. This is deliberately separate from the legacy
 * password-only portal session and the public offline demo.
 * No branch, Auth instance, or credential is provisioned here.
 */
export type PersonalOwner = { subject: string; workspace: "personal-staging" };
export function neonAuthSettings(env: NodeJS.ProcessEnv = process.env) {
  const issuer = env.REACH_NEON_AUTH_ISSUER?.trim() ?? "";
  const jwks = env.REACH_NEON_AUTH_JWKS_URL?.trim() ?? "";
  const audience = env.REACH_NEON_AUTH_AUDIENCE?.trim() ?? "";
  const owner = env.REACH_NEON_AUTH_OWNER_SUB?.trim() ?? "";
  const branch = env.REACH_NEON_STAGING_BRANCH_ID?.trim() ?? "";
  const allowed = (value: string) => {
    try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.hash; }
    catch { return false; }
  };
  const configured = allowed(issuer) && allowed(jwks) && !!audience && !!owner &&
    /^br-[a-z0-9-]+$/.test(branch) && env.REACH_PERSONAL_CONNECTIONS_ENABLED === "true";
  return { issuer, jwks, audience, owner, branch, configured };
}
export async function verifyPersonalNeonOwner(
  authorization: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PersonalOwner | null> {
  const c = neonAuthSettings(env);
  if (!c.configured || !authorization || !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization)) return null;
  try {
    const token = authorization.slice(7);
    const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(c.jwks)), {
      issuer: c.issuer, audience: c.audience, algorithms: ["RS256", "ES256"],
      clockTolerance: 5,
    });
    if (payload.sub !== c.owner || !payload.exp || !payload.iat || payload.exp - payload.iat > 3600) return null;
    return { subject: payload.sub, workspace: "personal-staging" };
  } catch { return null; }
}
