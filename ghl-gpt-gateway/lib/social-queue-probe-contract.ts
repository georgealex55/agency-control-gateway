/**
 * A queue probe verifies actual Vercel Queue push delivery, not provider
 * publishing. Its payload contains only staging workspace and probe IDs.
 */
export const SOCIAL_PROBE_TOPIC="agency-social-queue-probe-v1";
export type QueueProbePayload={probeId:string;workspaceId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validQueueProbePayload(payload:unknown):payload is QueueProbePayload{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return false;
 const p=payload as Record<string,unknown>;
 return typeof p.probeId==="string"&&uuid.test(p.probeId)&&typeof p.workspaceId==="string"&&uuid.test(p.workspaceId);
}
