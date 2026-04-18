"use client";

import { useState } from "react";

import type { ExamQuestionInput, OptionKey } from "@/lib/exam-questions";
import { apiFetch } from "@/lib/client-api";
import type { Exam, Submission } from "@/types/platform";

export function useExams() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchExams(filters?: { courseId?: string; tutorWallet?: string }) {
    try {
      setIsLoading(true);
      setError("");

      const search = new URLSearchParams();

      if (filters?.courseId) {
        search.set("courseId", filters.courseId);
      }

      if (filters?.tutorWallet) {
        search.set("tutorWallet", filters.tutorWallet);
      }

      const suffix = search.toString() ? `?${search.toString()}` : "";
      const data = await apiFetch<{ exams: Exam[] }>(`/api/exams${suffix}`);

      return data.exams;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load exams.";
      setError(message);
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function createExam(payload: {
    tutorWallet: string;
    courseId: string;
    title: string;
    description: string;
    creationFeeSignature: string;
    tokenPrice: number;
    passThresholdPercent: number;
    questions: ExamQuestionInput[];
  }) {
    try {
      setIsLoading(true);
      setError("");

      const data = await apiFetch<{ exam: Exam }>("/api/exams/create", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      return data.exam;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to create exam.";
      setError(message);
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchExam(examId: string, walletAddress?: string) {
    try {
      setIsLoading(true);
      setError("");
      const search = walletAddress
        ? `?walletAddress=${encodeURIComponent(walletAddress)}`
        : "";

      return await apiFetch<{
        exam: Exam;
        unlocked: boolean;
        latestSubmission: Submission | null;
      }>(`/api/exams/${examId}${search}`);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load exam.";
      setError(message);
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  async function submitExam(payload: {
    examId: string;
    studentWallet: string;
    answers: Array<{ questionId: string; selectedOptionKey: OptionKey }>;
  }) {
    try {
      setIsLoading(true);
      setError("");

      return await apiFetch<{
        submission: Submission;
        reward: {
          eligible: boolean;
          amountTokens: number;
          transactionSignature: string | null;
          memo: string;
          error: string | null;
        };
      }>(`/api/exams/${payload.examId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          studentWallet: payload.studentWallet,
          answers: payload.answers,
        }),
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to submit exam.";
      setError(message);
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }

  return {
    fetchExams,
    createExam,
    fetchExam,
    submitExam,
    isLoading,
    error,
  };
}
