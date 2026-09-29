import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function normalizeItems(payload) {
  const candidates = [
    payload?.funnels,
    payload?.data?.funnels,
    payload?.data,
    payload?.items,
    payload?.results,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function isWebsite(item) {
  const values = [
    item?.type,
    item?.category,
    item?.kind,
    item?.siteType,
    item?.funnelType,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (values.some((value) => value.includes("website") || value === "web")) {
    return true;
  }

  // HighLevel's funnel/site listing can omit a type discriminator.
  // In that case preserve the item rather than incorrectly dropping a website.
  return values.length === 0;
}

export async function GET(request) {
  const gatewayKey = request.headers.get("x-gateway-key");

  if (!gatewayKey) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams, origin } = new URL(request.url);
  const locationId = searchParams.get("locationId")?.trim();
  const searchTerm = searchParams.get("searchTerm")?.trim() || "";
  const includeAll = searchParams.get("includeAll") === "true";

  if (!locationId) {
    return NextResponse.json(
      { ok: false, error: "locationId is required" },
      { status: 400 }
    );
  }

  const upstream = await fetch(`${origin}/api/agency/action`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gateway-key": gatewayKey,
    },
    body: JSON.stringify({
      action: "list_funnels",
      locationId,
      type: "website",
      ...(searchTerm ? { searchTerm } : {}),
    }),
    cache: "no-store",
  });

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    const text = await upstream.text();
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid response from agency action",
        upstreamStatus: upstream.status,
        detail: text.slice(0, 1000),
      },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const items = normalizeItems(payload);
  let websites = includeAll ? items : items.filter(isWebsite);

  if (searchTerm) {
    const query = searchTerm.toLowerCase();
    websites = websites.filter((item) => {
      const haystack = [
        item?.name,
        item?.title,
        item?.domain,
        item?.url,
        item?.slug,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  return NextResponse.json({
    ok: true,
    locationId,
    searchTerm: searchTerm || null,
    count: websites.length,
    websites,
    source: "list_funnels",
  });
}
