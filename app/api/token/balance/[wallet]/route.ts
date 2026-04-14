import { errorResponse, successResponse } from "@/lib/api";
import { getTokenBalance } from "@/lib/solana";

export async function GET(
  _request: Request,
  context: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet } = await context.params;

    const balance = await getTokenBalance(wallet);

    return successResponse({ balance });
  } catch (error) {
    return errorResponse("Unable to fetch token balance.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
