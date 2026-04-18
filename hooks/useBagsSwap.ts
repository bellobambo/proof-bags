"use client";

import { createElement, useState } from "react";
import toast from "react-hot-toast";
import { Connection, VersionedTransaction } from "@solana/web3.js";

import { apiFetch } from "@/lib/client-api";
import { getClientEnv } from "@/lib/env";
import type { BagsSwapForExamResponse } from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

const CONFIRMATION_TIMEOUT_MS = 60_000;
const CONFIRMATION_POLL_INTERVAL_MS = 2_000;

function decodeBase64Transaction(serializedTransaction: string) {
  const binary = atob(serializedTransaction);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return VersionedTransaction.deserialize(bytes);
}

function buildSolscanTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

function formatSignature(signature: string) {
  if (signature.length <= 12) {
    return signature;
  }

  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

function createExplorerToastMessage(signature: string, label: string) {
  return createElement(
    "span",
    null,
    `${label} `,
    createElement(
      "a",
      {
        href: buildSolscanTxUrl(signature),
        target: "_blank",
        rel: "noreferrer",
        className: "underline",
      },
      formatSignature(signature),
    ),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForConfirmedSignature(connection: Connection, signature: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CONFIRMATION_TIMEOUT_MS) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value[0];

    if (status?.err) {
      throw new Error(`Swap failed on-chain: ${JSON.stringify(status.err)}`);
    }

    if (
      status?.confirmationStatus === "confirmed"
      || status?.confirmationStatus === "finalized"
    ) {
      return true;
    }

    await sleep(CONFIRMATION_POLL_INTERVAL_MS);
  }

  return false;
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

      const confirmed = await waitForConfirmedSignature(connection, result.signature);

      if (confirmed) {
        console.log("[bags-swap] confirmed transaction", {
          signature: result.signature,
        });
        toast.success(createExplorerToastMessage(result.signature, "Swap confirmed."));
      } else {
        console.warn("[bags-swap] confirmation timed out after submission", {
          signature: result.signature,
        });
        toast(createExplorerToastMessage(result.signature, "Swap submitted."));
      }

      return {
        ...swap,
        signature: result.signature,
        confirmed,
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
