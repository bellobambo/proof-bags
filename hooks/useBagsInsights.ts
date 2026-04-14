"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/client-api";
import type { BagsTokenInsights } from "@/types/platform";

export function useBagsInsights() {
  const [insights, setInsights] = useState<BagsTokenInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadInsights() {
      try {
        setIsLoading(true);
        setError("");

        const data = await apiFetch<{ insights: BagsTokenInsights }>(
          "/api/bags/token-insights",
        );

        if (active) {
          setInsights(data.insights);
        }
      } catch (caughtError) {
        if (!active) {
          return;
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load Bags insights.";

        setError(message);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadInsights();

    return () => {
      active = false;
    };
  }, []);

  return {
    insights,
    isLoading,
    error,
  };
}
