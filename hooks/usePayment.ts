"use client";

import { useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { getClientEnv } from "@/lib/env";
import type { SolanaProvider } from "@/types/wallet";

export function usePayment() {
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState("");

  async function payForExam(params: {
    wallet: SolanaProvider;
    studentWallet: string;
    amountTokens: number;
  }) {
    try {
      setIsPaying(true);
      setError("");

      const env = getClientEnv();
      const connection = new Connection(env.solanaRpcUrl, "confirmed");
      const mint = new PublicKey(env.tokenMint);
      const student = new PublicKey(params.studentWallet);
      const treasury = new PublicKey(env.treasuryWallet);
      const sourceAta = getAssociatedTokenAddressSync(mint, student);
      const destinationAta = getAssociatedTokenAddressSync(mint, treasury);
      const transaction = new Transaction();

      const destinationInfo = await connection.getAccountInfo(destinationAta);

      if (!destinationInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            student,
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
          student,
          BigInt(Math.round(params.amountTokens * 10 ** env.tokenDecimals)),
          env.tokenDecimals,
        ),
      );

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = student;
      transaction.recentBlockhash = blockhash;

      const result = await params.wallet.signAndSendTransaction(transaction);
      console.log("[payment] submitted transaction", {
        signature: result.signature,
        studentWallet: params.studentWallet,
        amountTokens: params.amountTokens,
        recentBlockhash: blockhash,
      });
      await connection.confirmTransaction(result.signature, "confirmed");
      console.log("[payment] confirmed transaction", {
        signature: result.signature,
      });

      return result.signature;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to send payment.";
      setError(message);
      throw caughtError;
    } finally {
      setIsPaying(false);
    }
  }

  return {
    payForExam,
    isPaying,
    error,
  };
}
