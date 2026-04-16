import { WRAPPED_SOL_MINT } from "@bagsfm/bags-sdk";
import { PublicKey } from "@solana/web3.js";
import { Types } from "mongoose";

import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { getBagsSdk } from "@/lib/bags";
import { connectToDatabase } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import Exam from "@/models/Exam";

export const dynamic = "force-dynamic";

const LAMPORTS_PER_SOL = 1_000_000_000;
const MIN_INPUT_LAMPORTS = 0.0001 * LAMPORTS_PER_SOL;
const MAX_INPUT_LAMPORTS = 0.1 * LAMPORTS_PER_SOL;

function toTokenBaseUnits(amountTokens: number, decimals: number) {
  return BigInt(Math.round(amountTokens * 10 ** decimals));
}

async function findQuoteForTarget(params: {
  sdk: ReturnType<typeof getBagsSdk>;
  outputMint: PublicKey;
  targetOutputAmount: bigint;
}) {
  let candidateLamports = Math.round(MIN_INPUT_LAMPORTS);
  let candidateQuote = await params.sdk.trade.getQuote({
    inputMint: WRAPPED_SOL_MINT,
    outputMint: params.outputMint,
    amount: candidateLamports,
    slippageMode: "auto",
  });

  while (
    BigInt(candidateQuote.outAmount) < params.targetOutputAmount &&
    candidateLamports < MAX_INPUT_LAMPORTS
  ) {
    candidateLamports = Math.min(candidateLamports * 2, MAX_INPUT_LAMPORTS);
    candidateQuote = await params.sdk.trade.getQuote({
      inputMint: WRAPPED_SOL_MINT,
      outputMint: params.outputMint,
      amount: candidateLamports,
      slippageMode: "auto",
    });
  }

  if (BigInt(candidateQuote.outAmount) < params.targetOutputAmount) {
    throw new Error("Unable to build a swap quote large enough to cover this exam price.");
  }

  return {
    quote: candidateQuote,
    inputLamports: candidateLamports,
  };
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv();

    if (!env.bagsApiKey) {
      return errorResponse("BAGS_API_KEY is required to create Bags swap transactions.", 500);
    }

    const body = await request.json();
    const examId = body.examId?.trim?.() ?? "";
    const studentWallet = normalizeWalletAddress(body.studentWallet ?? "");

    if (!examId || !studentWallet) {
      return errorResponse("examId and studentWallet are required.");
    }

    if (!Types.ObjectId.isValid(examId)) {
      return errorResponse("Exam id is invalid.");
    }

    await connectToDatabase();

    const exam = await Exam.findById(examId);

    if (!exam) {
      return errorResponse("Exam not found.", 404);
    }

    const sdk = getBagsSdk();
    const outputMint = new PublicKey(env.tokenMint);
    const userPublicKey = new PublicKey(studentWallet);
    const targetOutputAmount = toTokenBaseUnits(exam.tokenPrice, env.tokenDecimals);
    const { quote, inputLamports } = await findQuoteForTarget({
      sdk,
      outputMint,
      targetOutputAmount,
    });

    const swap = await sdk.trade.createSwapTransaction({
      quoteResponse: quote,
      userPublicKey,
    });

    return successResponse({
      examId,
      examPriceTokens: exam.tokenPrice,
      inputAmountLamports: inputLamports,
      inputAmountSol: inputLamports / LAMPORTS_PER_SOL,
      estimatedOutputTokens: Number(quote.outAmount) / 10 ** env.tokenDecimals,
      minimumOutputTokens: Number(quote.minOutAmount) / 10 ** env.tokenDecimals,
      priceImpactPct: Number(quote.priceImpactPct),
      swapTransaction: Buffer.from(swap.transaction.serialize()).toString("base64"),
      lastValidBlockHeight: swap.lastValidBlockHeight,
      prioritizationFeeLamports: swap.prioritizationFeeLamports,
      computeUnitLimit: swap.computeUnitLimit,
      requestId: quote.requestId,
      routeVenues: [...new Set(quote.routePlan.map((leg) => leg.venue))],
    });
  } catch (error) {
    return errorResponse("Unable to create Bags swap transaction.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
