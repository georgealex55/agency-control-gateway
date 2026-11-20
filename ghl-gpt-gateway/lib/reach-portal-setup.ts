/**
 * REACH owner login readiness: safe, non-secret diagnostics.
 * No credential value, length, fingerprint, or hash is returned to the client.
 */
export type PortalSetupIssue="password_hash_invalid"|"session_secret_invalid"|"both_invalid"|null;
export function assessPortalCredentials(hash:string,secret:string):{configured:boolean;setupIssue:PortalSetupIssue}{
 const hashValid=/^[a-f0-9]{64}$/.test(hash.trim().toLowerCase());
 const secretValid=secret.length>=32;
 return {configured:hashValid&&secretValid,
  setupIssue:hashValid?(secretValid?null:"session_secret_invalid"):(secretValid?"password_hash_invalid":"both_invalid")};
}
