"use client";

import { useState } from "react";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import { apiFetch } from "@/lib/client-api";
import { getClientEnv } from "@/lib/env";
import type { Submission } from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const CONFIRMATION_TIMEOUT_MS = 60_000;
const CONFIRMATION_POLL_INTERVAL_MS = 2_000;

function createMemoInstruction(memo: string, signer: PublicKey) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: new TextEncoder().encode(memo),
  });
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
    const status = value[0];

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

export function useSubmissionProof() {
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [error, setError] = useState("");

  async function submitSubmissionProof(params: {
    examId: string;
    submissionId: string;
    studentWallet: string;
    wallet: SolanaProvider;
    scoreProofMemo: string;
  }) {
    if (typeof params.wallet.signTransaction !== "function") {
      throw new Error("Connected wallet does not support signing transactions.");
    }

    try {
      setIsSubmittingProof(true);
      setError("");

      const connection = new Connection(getClientEnv().solanaRpcUrl, "confirmed");
      const studentPublicKey = new PublicKey(params.studentWallet);
      const transaction = new Transaction().add(
        createMemoInstruction(params.scoreProofMemo, studentPublicKey),
      );
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = studentPublicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      const signedTransaction = await params.wallet.signTransaction(transaction);
      const transactionBytes = signedTransaction.serialize();
      const relay = await apiFetch<{ signature: string }>("/api/bags/send-transaction", {
        method: "POST",
        body: JSON.stringify({
          transaction: bs58.encode(transactionBytes),
        }),
      });

      await waitForConfirmedSignature(connection, relay.signature);

      const proof = await apiFetch<{ submission: Submission }>(
        `/api/exams/${params.examId}/submission-proof`,
        {
          method: "POST",
          body: JSON.stringify({
            submissionId: params.submissionId,
            studentWallet: params.studentWallet,
            scoreProofMemo: params.scoreProofMemo,
            scoreProofSignature: relay.signature,
          }),
        },
      );

      return proof.submission;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to submit the score proof transaction.";
      setError(message);
      throw caughtError;
    } finally {
      setIsSubmittingProof(false);
    }
  }

  return {
    submitSubmissionProof,
    isSubmittingProof,
    error,
  };
}
