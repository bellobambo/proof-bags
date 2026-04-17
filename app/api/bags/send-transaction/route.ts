import { errorResponse, successResponse } from "@/lib/api";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = getServerEnv();

    if (!env.bagsApiKey) {
      return errorResponse("BAGS_API_KEY is required to relay signed transactions.", 500);
    }

    const body = await request.json();
    const transaction = body.transaction?.trim?.() ?? "";

    if (!transaction) {
      return errorResponse("transaction is required.");
    }

    const response = await fetch("https://public-api-v2.bags.fm/api/v1/solana/send-transaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.bagsApiKey,
      },
      body: JSON.stringify({ transaction }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; response?: string; message?: string }
      | null;

    if (!response.ok || !payload?.success || !payload.response) {
      return errorResponse("Unable to relay signed transaction to Bags.", response.status || 502, {
        message: payload?.message ?? "Bags send-transaction request failed.",
      });
    }

    return successResponse({
      signature: payload.response,
    });
  } catch (error) {
    return errorResponse("Unable to relay signed transaction to Bags.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
