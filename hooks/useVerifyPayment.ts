"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/client-api";
import type { Payment } from "@/types/platform";

export function useVerifyPayment() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  async function verifyPayment(payload: {
    examId: string;
    studentWallet: string;
    signature: string;
  }) {
    try {
      setIsVerifying(true);
      setError("");

      return await apiFetch<{
        payment: Payment;
        examUnlocked: boolean;
        alreadyVerified?: boolean;
      }>("/api/payments/verify", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify payment.";
      setError(message);
      throw caughtError;
    } finally {
      setIsVerifying(false);
    }
  }

  return {
    verifyPayment,
    isVerifying,
    error,
  };
}
