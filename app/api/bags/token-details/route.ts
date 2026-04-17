import { errorResponse, successResponse } from "@/lib/api";
import { getServerEnv } from "@/lib/env";
import type { BagsTokenDetails } from "@/types/platform";

export const dynamic = "force-dynamic";

function formatLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null) {
    return "None";
  }

  return "";
}

function pickDetails(payload: unknown): BagsTokenDetails {
  const responseList =
    payload
    && typeof payload === "object"
    && "response" in payload
    && Array.isArray(payload.response)
      ? payload.response
      : [];

  const firstEntry =
    responseList[0] && typeof responseList[0] === "object" && !Array.isArray(responseList[0])
      ? (responseList[0] as Record<string, unknown>)
      : null;

  if (!firstEntry) {
    return {
      entries: [],
      raw: null,
      pfpUrl: "",
    };
  }

  const fields = [
    "username",
    "isCreator",
    "bagsUsername",
    "isAdmin",
    "wallet",
  ] as const;
  const twitterUsername =
    typeof firstEntry.twitterUsername === "string" && firstEntry.twitterUsername.trim()
      ? firstEntry.twitterUsername.trim()
      : typeof firstEntry.providerUsername === "string"
        && firstEntry.providerUsername.trim()
        && firstEntry.provider === "twitter"
          ? firstEntry.providerUsername.trim()
          : "";
  const normalizedTwitterUsername = twitterUsername.replace(/^@/, "");
  const twitterUrl = normalizedTwitterUsername
    ? `https://x.com/${normalizedTwitterUsername}`
    : "";

  return {
    entries: [
      ...fields
      .map((key) => {
        const value = firstEntry[key];
        const formattedValue = formatValue(value);

        if (!formattedValue) {
          return null;
        }

        return {
          label: formatLabel(key),
          value: formattedValue,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      ...(normalizedTwitterUsername
        ? [
            {
              label: "Twitter Username",
              value: `@${normalizedTwitterUsername}`,
            },
          ]
        : []),
      ...(twitterUrl
        ? [
            {
              label: "Twitter URL",
              value: twitterUrl,
            },
          ]
        : []),
    ],
    raw: firstEntry,
    pfpUrl: typeof firstEntry.pfp === "string" ? firstEntry.pfp : "",
  };
}

export async function GET() {
  try {
    const env = getServerEnv();
    const tokenMint = process.env.NEXT_PUBLIC_BAGS_TOKEN_MINT?.trim() || env.tokenMint;

    if (!env.bagsApiKey) {
      return errorResponse("Missing required environment variable: BAGS_API_KEY", 500);
    }

    if (!tokenMint) {
      return errorResponse("Missing Bags token mint.", 500);
    }

    const response = await fetch(
      `https://public-api-v2.bags.fm/api/v1/token-launch/creator/v3?tokenMint=${encodeURIComponent(tokenMint)}`,
      {
        headers: {
          "x-api-key": env.bagsApiKey,
        },
        cache: "no-store",
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      return errorResponse(
        typeof payload?.error === "string" ? payload.error : "Unable to load token details.",
        response.status,
      );
    }

    const candidateDetails =
      payload?.data && typeof payload.data === "object"
        ? payload.data
        : payload;

    return successResponse({
      tokenDetails: pickDetails(candidateDetails),
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to load token details.";

    return errorResponse(message, 500);
  }
}
