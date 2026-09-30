import { HighLevel, LogLevel } from "@gohighlevel/api-client";

/**
 * Official HighLevel SDK client.
 *
 * Phase 1 deliberately uses the existing Private Integration token so the
 * gateway's production authentication behavior does not change while SDK
 * calls are introduced incrementally.
 */
let client: HighLevel | undefined;

export function getHighLevelClient(): HighLevel {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN?.trim();
  if (!token) {
    throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN is not configured");
  }

  if (!client) {
    client = new HighLevel({
      privateIntegrationToken: token,
      logLevel: LogLevel.WARN,
      rateLimitRetry: true,
    });
  }

  return client;
}

/**
 * Escape hatch for endpoints that are not yet represented by a typed SDK
 * service. This still benefits from the SDK's configured authentication,
 * error handling and rate-limit retry behavior.
 */
export async function ghlSdkRequest<T = unknown>(input: {
  method: string;
  url: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
}): Promise<T> {
  const ghl = getHighLevelClient();
  const response = await ghl.request({
    method: input.method,
    url: input.url,
    params: input.params,
    data: input.data,
    headers: input.headers,
  });

  return response.data as T;
}
