"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/client-api";
import type { Course } from "@/types/platform";

export function useCreateCourse() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function createCourse(payload: {
    tutorWallet: string;
    title: string;
    description: string;
  }) {
    try {
      setIsSubmitting(true);
      setError("");

      const data = await apiFetch<{ course: Course }>("/api/courses/create", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      return data.course;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to create course.";
      setError(message);
      throw caughtError;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    createCourse,
    isSubmitting,
    error,
  };
}
