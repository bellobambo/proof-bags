"use client";

import { createElement, useState } from "react";
import toast from "react-hot-toast";
import {
  Connection,
  PublicKey,
  type SignatureStatus,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { getClientEnv } from "@/lib/env";
import type { SolanaProvider } from "@/types/wallet";

const CONFIRMATION_TIMEOUT_MS = 60_000;
const CONFIRMATION_POLL_INTERVAL_MS = 2_000;

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

async function waitForConfirmedSignature(
  connection: Connection,
  signature: string,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CONFIRMATION_TIMEOUT_MS) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value[0] as SignatureStatus | null;

    if (status?.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
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

export function useExamCreationFee() {
  const [isPayingFee, setIsPayingFee] = useState(false);
  const [error, setError] = useState("");

  async function payExamCreationFee(params: {
    wallet: SolanaProvider;
    tutorWallet: string;
    amountTokens?: number;
  }) {
    try {
      setIsPayingFee(true);
      setError("");

      const env = getClientEnv();
      const connection = new Connection(env.solanaRpcUrl, "confirmed");
      const mint = new PublicKey(env.tokenMint);
      const tutor = new PublicKey(params.tutorWallet);
      const treasury = new PublicKey(env.treasuryWallet);
      const sourceAta = getAssociatedTokenAddressSync(mint, tutor);
      const destinationAta = getAssociatedTokenAddressSync(mint, treasury);
      const transaction = new Transaction();
      const amountTokens = params.amountTokens ?? env.examCreationFeeTokens;
      const totalBaseUnits = BigInt(Math.round(amountTokens * 10 ** env.tokenDecimals));

      const destinationInfo = await connection.getAccountInfo(destinationAta);

      if (!destinationInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            tutor,
            destinationAta,
            treasury,
            mint,
          ),
        );
      }

      transaction.add(
        createTransferCheckedInstruction(
          sourceAta,
          mint,
          destinationAta,
          tutor,
          totalBaseUnits,
          env.tokenDecimals,
        ),
      );

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = tutor;
      transaction.recentBlockhash = blockhash;

      const result = await params.wallet.signAndSendTransaction(transaction);
      const confirmed = await waitForConfirmedSignature(connection, result.signature);

      if (confirmed) {
        toast.success(createExplorerToastMessage(result.signature, "Exam fee confirmed."));
      } else {
        toast(createExplorerToastMessage(result.signature, "Exam fee submitted."));
      }

      return result.signature;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to pay exam creation fee.";
      setError(message);
      throw caughtError;
    } finally {
      setIsPayingFee(false);
    }
  }

  return {
    payExamCreationFee,
    isPayingFee,
    error,
  };
}
