/** Only fixed, non-secret diagnostic codes may leave the OAuth handler. */
export const GOOGLE_DIAGNOSTICS={
 callback_origin:"Return to the canonical REACH URL. The callback hostname was not verified.",
 configuration_unavailable:"Google authorization is disabled or encrypted application configuration could not be loaded.",
 state_missing:"Google returned without authorization state. Start a new connection.",
 state_invalid:"The authorization state was malformed. Start a new connection.",
 cookie_missing:"The browser verification cookie is missing or expired. Start again in the same browser profile and allow first-party cookies.",
 cookie_mismatch:"This browser does not match the authorization attempt. Start again in the same browser profile.",
 state_expired:"This authorization attempt expired. Start a new connection.",
 state_unknown:"Authorization attempt not found or already used. Start again; do not reuse a previous callback.",
 client_changed:"The saved Google application does not match this attempt. Start a new connection.",
 flow_storage:"Authorization state could not be read or consumed securely. Retry from REACH.",
 verifier_unavailable:"The encrypted authorization verifier could not be opened. Start a new connection.",
 consent_denied:"Google permission approval was canceled or denied. Retry and approve the requested read-only permissions.",
 invalid_client:"Google rejected the OAuth client credentials. Check the Web application client ID and secret.",
 invalid_grant:"Google rejected the authorization code or refresh grant. Start a fresh authorization; check the exact registered redirect URI.",
 redirect_uri_mismatch:"Google rejected the redirect URI. Register the exact REACH callback on the saved Web application client.",
 invalid_scope:"Google rejected a requested permission. Check OAuth consent settings and the enabled APIs.",
 unauthorized_client:"Google does not allow this client to use the requested authorization flow. Check Web application configuration and consent settings.",
 access_blocked:"Google blocked the application or account. Check consent publishing status, test users and organization policies.",
 provider_error:"Google returned an authorization error. Check Google consent settings and retry.",
 code_missing:"Google returned without an authorization code. Start a fresh connection.",
 token_unavailable:"Google token exchange did not complete. Retry; check network availability and application configuration.",
 grant_invalid:"Google did not return the required read-only permission grant. Approve the requested permissions and retry.",
 offline_missing:"Google did not return offline access. Start a new authorization and grant consent.",
 identity_unavailable:"Google account identity could not be verified. Select the intended Google account and retry.",
 pending_storage:"Google approved access, but REACH could not securely save the pending selection. Retry; existing connections are unchanged.",
 resource_unavailable:"Google resource discovery failed. Verify the API is enabled and the selected account has access.",
 selection_unavailable:"The resource could not be selected. Check permission, domain matching and existing property mappings.",
 verification_unavailable:"Google could not verify the saved resource. Reauthorize the same account if necessary.",
 selection_ready:"Google authorization succeeded. Load authorized resources and confirm the specific account or property.",
} as const;
export type GoogleDiagnostic=keyof typeof GOOGLE_DIAGNOSTICS;
export function diagnosticCode(v:unknown):GoogleDiagnostic|null{return typeof v==="string"&&Object.hasOwn(GOOGLE_DIAGNOSTICS,v)?v as GoogleDiagnostic:null;}
export class GoogleDiagnosticError extends Error{
 readonly code:GoogleDiagnostic;
 constructor(code:GoogleDiagnostic){super(GOOGLE_DIAGNOSTICS[code]);this.name="GoogleDiagnosticError";this.code=code;}
}
export function safeDiagnostic(e:unknown,fallback:GoogleDiagnostic):GoogleDiagnostic{return e instanceof GoogleDiagnosticError?e.code:fallback;}
export function providerDiagnostic(v:unknown):GoogleDiagnostic{
 switch(v){case "access_denied":return "consent_denied";case "invalid_client":case "invalid_grant":case "redirect_uri_mismatch":case "invalid_scope":case "unauthorized_client":return v;case "admin_policy_enforced":case "org_internal":case "disallowed_useragent":case "restricted_client":return "access_blocked";default:return "provider_error";}
}
export const GOOGLE_FLOW_SECONDS=900;
export function validGoogleNonce(v:unknown):v is string{return typeof v==="string"&&/^[A-Za-z0-9_-]{43}$/.test(v);}
export function flowFailure(row:{expired:boolean;browserMatches:boolean;clientMatches:boolean}|null):GoogleDiagnostic{
 if(!row)return "state_unknown";
 if(row.expired)return "state_expired";
 if(!row.clientMatches)return "client_changed";
 if(!row.browserMatches)return "cookie_mismatch";
 return "state_unknown";
}
/** Vercel may expose an internal nextUrl origin. Require the canonical routed host and HTTPS;
 * conflicting host headers are never accepted, and arbitrary aliases are not trusted.
 */
export function canonicalGoogleRequest(origin:string,host:string|null,forwarded:string|null,proto:string|null,env:string|undefined){
 const canonical="agency-control-gateway.vercel.app";
 if(env!=="production")return false;
 if(host&&host.toLowerCase()!==canonical)return false;
 if(forwarded&&forwarded.toLowerCase()!==canonical)return false;
 if(proto&&proto!=="https")return false;
 if(origin==="https://"+canonical)return Boolean(host||forwarded);
 return proto==="https"&&Boolean(host||forwarded);
}
