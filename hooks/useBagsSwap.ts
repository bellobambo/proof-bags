"use client";

import { useState } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";

import { apiFetch } from "@/lib/client-api";
import { getClientEnv } from "@/lib/env";
import type { BagsSwapForExamResponse } from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

function decodeBase64Transaction(serializedTransaction: string) {
  const binary = atob(serializedTransaction);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return VersionedTransaction.deserialize(bytes);
}

export function useBagsSwap() {
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState("");

  async function swapForExam(params: {
    examId: string;
    studentWallet: string;
    wallet: SolanaProvider;
  }) {
    try {
      setIsSwapping(true);
      setError("");

      const swap = await apiFetch<BagsSwapForExamResponse>("/api/bags/swap-for-exam", {
        method: "POST",
        body: JSON.stringify({
          examId: params.examId,
          studentWallet: params.studentWallet,
        }),
      });

      const connection = new Connection(getClientEnv().solanaRpcUrl, "confirmed");
      const transaction = decodeBase64Transaction(swap.swapTransaction);
      const result = await params.wallet.signAndSendTransaction(transaction);
      console.log("[bags-swap] submitted transaction", {
        signature: result.signature,
        examId: params.examId,
        studentWallet: params.studentWallet,
        recentBlockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: swap.lastValidBlockHeight,
        estimatedOutputTokens: swap.estimatedOutputTokens,
      });

      await connection.confirmTransaction(
        {
          blockhash: transaction.message.recentBlockhash,
          lastValidBlockHeight: swap.lastValidBlockHeight,
          signature: result.signature,
        },
        "confirmed",
      );
      console.log("[bags-swap] confirmed transaction", {
        signature: result.signature,
      });

      return {
        ...swap,
        signature: result.signature,
      };
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to complete Bags swap.";
      setError(message);
      throw caughtError;
    } finally {
      setIsSwapping(false);
    }
  }

  return {
    swapForExam,
    isSwapping,
    error,
  };
}
