import { WRAPPED_SOL_MINT } from "@bagsfm/bags-sdk";
import { PublicKey } from "@solana/web3.js";

import { errorResponse, successResponse } from "@/lib/api";
import { getBagsSdk } from "@/lib/bags";
import { getServerEnv } from "@/lib/env";
import type { BagsTokenInsights } from "@/types/platform";

export const dynamic = "force-dynamic";

const DEFAULT_QUOTE_SOL = 0.05;
const LAMPORTS_PER_SOL = 1_000_000_000;

export async function GET() {
  try {
    const env = getServerEnv();

    if (!env.bagsApiKey) {
      return successResponse({
        insights: {
          enabled: false,
          tokenMint: env.tokenMint,
          lifetimeFees: 0,
          creatorCount: 0,
          creators: [],
          recentClaims: [],
          quote: null,
        } satisfies BagsTokenInsights,
      });
    }

    const sdk = getBagsSdk();
    const tokenMint = new PublicKey(env.tokenMint);
    const quoteLamports = Math.round(DEFAULT_QUOTE_SOL * LAMPORTS_PER_SOL);

    const [lifetimeFees, claimStats, claimEvents, quote] = await Promise.all([
      sdk.state.getTokenLifetimeFees(tokenMint),
      sdk.state.getTokenClaimStats(tokenMint),
      sdk.state.getTokenClaimEvents(tokenMint, { limit: 5, offset: 0 }),
      sdk.trade.getQuote({
        inputMint: WRAPPED_SOL_MINT,
        outputMint: tokenMint,
        amount: quoteLamports,
        slippageMode: "auto",
      }),
    ]);

    return successResponse({
      insights: {
        enabled: true,
        tokenMint: tokenMint.toBase58(),
        lifetimeFees,
        creatorCount: claimStats.length,
        creators: claimStats.slice(0, 4).map((creator) => ({
          username: creator.username,
          wallet: creator.wallet,
          provider: creator.provider,
          avatarUrl: creator.pfp,
          totalClaimed: creator.totalClaimed,
          isCreator: creator.isCreator,
        })),
        recentClaims: claimEvents.map((event) => ({
          wallet: event.wallet,
          amount: event.amount,
          signature: event.signature,
          timestamp: event.timestamp,
          isCreator: event.isCreator,
        })),
        quote: {
          inputSol: DEFAULT_QUOTE_SOL,
          estimatedOutputTokens:
            Number(quote.outAmount) / 10 ** env.tokenDecimals,
          minimumOutputTokens:
            Number(quote.minOutAmount) / 10 ** env.tokenDecimals,
          priceImpactPct: Number(quote.priceImpactPct),
          routeVenues: [...new Set(quote.routePlan.map((leg) => leg.venue))],
        },
      } satisfies BagsTokenInsights,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to load Bags token insights.";

    return errorResponse(message, 500);
  }
}
