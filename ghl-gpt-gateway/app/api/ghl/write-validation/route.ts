import { NextResponse } from "next/server";
import { GHLError } from "@gohighlevel/api-client";
import { isAuthorized } from "@/lib/auth";
import { executeSdkWriteAction } from "@/lib/ghl-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = {
  action: string;
  ok: boolean;
  status?: number;
  expectedFailure: boolean;
  note: string;
};

function safeStatus(error: unknown): number | undefined {
  if (error instanceof GHLError && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if (error && typeof error === "object" && "statusCode" in error) {
    const status = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isInteger(status) ? status : undefined;
  }

  return undefined;
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown SDK error";
}

async function expectRejectedWrite(
  action: string,
  payload: Record<string, unknown>,
): Promise<Check> {
  try {
    const result = await executeSdkWriteAction(action, payload);

    if (!result) {
      return {
        action,
        ok: false,
        expectedFailure: false,
        note: "Action is not routed through the official SDK.",
      };
    }

    return {
      action,
      ok: false,
      status: result.status,
      expectedFailure: false,
      note:
        "Unexpected success. The validation payload was intentionally invalid and should not create or modify data.",
    };
  } catch (error) {
    const status = safeStatus(error);

    if (status === 401 || status === 403) {
      return {
        action,
        ok: false,
        status,
        expectedFailure: true,
        note: `Write authorization failed: ${safeMessage(error)}`,
      };
    }

    if (status && status >= 400 && status < 500) {
      return {
        action,
        ok: true,
        status,
        expectedFailure: true,
        note:
          "Expected validation/not-found rejection received after OAuth authentication and route authorization.",
      };
    }

    return {
      action,
      ok: false,
      status,
      expectedFailure: true,
      note: `Unexpected SDK failure: ${safeMessage(error)}`,
    };
  }
}

/**
 * Protected, non-mutating write-capability preflight.
 *
 * Every payload is intentionally invalid. A 4xx validation/not-found response
 * (other than 401/403) proves that the Location OAuth token reached a protected
 * write endpoint with the required write scope, without creating live data.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { locationId?: unknown };
  const locationId =
    typeof body.locationId === "string" ? body.locationId.trim() : "";

  if (!locationId) {
    return NextResponse.json(
      { error: "locationId is required" },
      { status: 400 },
    );
  }

  const invalidId = "write-validation-do-not-create";

  const checks = [
    await expectRejectedWrite("create_social_post", {
      locationId,
      body: {},
    }),
    await expectRejectedWrite("create_blog_post", {
      locationId,
      body: {},
    }),
    await expectRejectedWrite("create_redirect", {
      locationId,
      body: {},
    }),
    await expectRejectedWrite("add_contact_to_workflow", {
      locationId,
      contactId: invalidId,
      workflowId: invalidId,
      body: {},
    }),
  ];

  const failed = checks.filter((check) => !check.ok);

  return NextResponse.json(
    {
      ok: failed.length === 0,
      transport: "official-sdk",
      mode: "non-mutating-invalid-payload-preflight",
      checks,
      passed: checks.filter((check) => check.ok).length,
      failed: failed.length,
    },
    { status: failed.length === 0 ? 200 : 502 },
  );
}
