"use client";

import { createElement } from "react";
import { Button, Drawer, Input, Modal } from "antd";
import toast from "react-hot-toast";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import mammoth from "mammoth";

import { useCourses } from "@/hooks/useCourses";
import { useCreateCourse } from "@/hooks/useCreateCourse";
import { useExams } from "@/hooks/useExams";
import { usePayment } from "@/hooks/usePayment";
import { useSubmissionProof } from "@/hooks/useSubmissionProof";
import { useVerifyPayment } from "@/hooks/useVerifyPayment";
import { useBagsSwap } from "@/hooks/useBagsSwap";
import { useExamCreationFee } from "@/hooks/useExamCreationFee";
import { useWalletSession } from "@/components/wallet-session-provider";
import { apiFetch } from "@/lib/client-api";
import { getClientEnv } from "@/lib/env";
import {
  createEmptyQuestionInput,
  OPTION_KEYS,
  parseTemplateQuestions,
  validateExamQuestionInput,
  type ExamQuestionInput,
  type OptionKey,
} from "@/lib/exam-questions";
import type {
  BagsTokenDetails,
  Course,
  Exam,
  PlatformUser,
  Submission,
  UserRole,
} from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

type QuestionDraft = ExamQuestionInput;
type ExamCreationMode = "manual" | "upload" | "ai";
const BAGS_TOKEN_URL = "https://bags.fm/$BELLOBAMBO";
const PAYMENT_VERIFY_RETRY_COUNT = 12;
const PAYMENT_VERIFY_RETRY_DELAY_MS = 2_000;

function formatSubmissionScore(submission?: {
  scorePercent: number;
  correctAnswers: number;
  totalQuestions: number;
} | null) {
  if (!submission) {
    return "";
  }

  return `${submission.scorePercent}% (${submission.correctAnswers}/${submission.totalQuestions})`;
}

function formatWalletAddress(walletAddress: string) {
  if (walletAddress.length <= 10) {
    return walletAddress;
  }

  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
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

function getWalletProvider(): SolanaProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.phantom?.solana ?? window.solana ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function registerUser(payload: {
  walletAddress: string;
  role: UserRole;
  displayName: string;
}) {
  const data = await apiFetch<{ user: PlatformUser }>("/api/users/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return data.user;
}

async function fetchBalance(walletAddress: string) {
  const data = await apiFetch<{
    balance: { amount: number; amountRaw: string; decimals: number };
  }>(`/api/token/balance/${walletAddress}`);

  return data.balance;
}

async function fetchTokenDetails() {
  const data = await apiFetch<{ tokenDetails: BagsTokenDetails }>("/api/bags/token-details");

  return data.tokenDetails;
}

function formatTokenBalance(amountRaw: string, decimals: number) {
  const normalizedRaw = amountRaw.replace(/^0+/, "") || "0";

  if (decimals <= 0) {
    return normalizedRaw;
  }

  const paddedRaw = normalizedRaw.padStart(decimals + 1, "0");
  const whole = paddedRaw.slice(0, -decimals) || "0";
  const fraction = paddedRaw.slice(-decimals).slice(0, 4);

  return fraction ? `${whole}.${fraction}` : whole;
}

async function fetchExamList(filters?: {
  courseId?: string;
  tutorWallet?: string;
  walletAddress?: string;
}) {
  const search = new URLSearchParams();

  if (filters?.courseId) {
    search.set("courseId", filters.courseId);
  }

  if (filters?.tutorWallet) {
    search.set("tutorWallet", filters.tutorWallet);
  }

  if (filters && "walletAddress" in filters && filters.walletAddress) {
    search.set("walletAddress", filters.walletAddress);
  }

  const suffix = search.toString() ? `?${search.toString()}` : "";
  const data = await apiFetch<{ exams: Exam[] }>(`/api/exams${suffix}`);

  return data.exams;
}

async function fetchEnrolledCourseIds(studentWallet: string) {
  const data = await apiFetch<{ courseIds: string[] }>(
    `/api/courses/enroll?studentWallet=${encodeURIComponent(studentWallet)}`,
  );

  return data.courseIds;
}

async function enrollInCourse(payload: { courseId: string; studentWallet: string }) {
  return apiFetch<{ courseId: string }>("/api/courses/enroll", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function Surface({
  children,
  className = "",
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <section
      className={` ${className}`}
    >
      {children}
    </section>
  );
}

const { TextArea } = Input;

export function PlatformApp() {
  const pathname = usePathname();
  const isExamsPage = pathname === "/exams";
  const { courses, refresh: refreshCourses, isLoading: coursesLoading } = useCourses();
  const { createCourse, isSubmitting: courseSubmitting } = useCreateCourse();
  const {
    createExam,
    fetchExam,
    submitExam,
    isLoading: examLoading,
  } = useExams();
  const { payForExam, isPaying } = usePayment();
  const { submitSubmissionProof } = useSubmissionProof();
  const { verifyPayment, isVerifying } = useVerifyPayment();
  const { swapForExam, isSwapping } = useBagsSwap();
  const { payExamCreationFee, isPayingFee } = useExamCreationFee();
  const {
    walletAddress,
    role,
    displayName,
    registeredUser,
    hydrated,
    setRole,
    setDisplayName,
    setRegisteredUser,
    connectWallet,
    disconnectWallet,
  } = useWalletSession();

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [allExams, setAllExams] = useState<Exam[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [examUnlocked, setExamUnlocked] = useState(false);
  const [latestScore, setLatestScore] = useState("");
  const [latestSubmission, setLatestSubmission] = useState<Submission | null>(null);
  const [paymentSignature, setPaymentSignature] = useState("");
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [tokenBalanceDisplay, setTokenBalanceDisplay] = useState("Unavailable");
  const [isActionsDrawerOpen, setIsActionsDrawerOpen] = useState(false);
  const [tokenDetails, setTokenDetails] = useState<BagsTokenDetails | null>(null);
  const [isTokenDetailsLoading, setIsTokenDetailsLoading] = useState(false);
  const [tokenDetailsError, setTokenDetailsError] = useState("");
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [isCreateExamDrawerOpen, setIsCreateExamDrawerOpen] = useState(false);
  const [isExamDrawerOpen, setIsExamDrawerOpen] = useState(false);
  const [isEnrollingCourseId, setIsEnrollingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState({
    title: "",
  });
  const [examForm, setExamForm] = useState({
    title: "",
    description: "",
    tokenPrice: "5",
  });
  const [examCreationMode, setExamCreationMode] = useState<ExamCreationMode>("manual");
  const [questions, setQuestions] = useState<QuestionDraft[]>([createEmptyQuestionInput()]);
  const [uploadTemplateFileName, setUploadTemplateFileName] = useState("");
  const [aiConfig, setAiConfig] = useState({
    questionCount: "5",
    additionalContext: "",
    lectureNotesText: "",
    lectureNotesFileName: "",
  });
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, OptionKey>>({});
  const [isWalletActionLoading, setIsWalletActionLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);
  const [isLoadingExam, setIsLoadingExam] = useState(false);
  const isRegistered = Boolean(registeredUser);
  const activeRole = registeredUser?.role ?? role;
  const selectedCourseTitle = courses.find((course) => course.id === selectedCourseId)?.title;
  const isTutorViewingOwnExam = Boolean(
    selectedExam && activeRole === "tutor" && selectedExam.tutorWallet === walletAddress,
  );

  function setStatusMessage(_message?: string) {
    void _message;
  }

  function showErrorToast(error: unknown, fallbackMessage: string) {
    toast.error(error instanceof Error ? error.message : fallbackMessage);
  }

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      if (!walletAddress) {
        if (active) {
          setTokenBalanceDisplay("Unavailable");
        }
        return;
      }

      try {
        const balance = await fetchBalance(walletAddress);
        if (active) {
          setTokenBalanceDisplay(formatTokenBalance(balance.amountRaw, balance.decimals));
        }
      } catch {
        if (active) {
          setTokenBalanceDisplay("Unavailable");
        }
      }
    });

    return () => {
      active = false;
    };
  }, [walletAddress, paymentSignature]);

  useEffect(() => {
    let active = true;

    if (!isActionsDrawerOpen) {
      return () => {
        active = false;
      };
    }

    setIsTokenDetailsLoading(true);
    setTokenDetailsError("");

    void Promise.resolve().then(async () => {
      try {
        const details = await fetchTokenDetails();

        if (active) {
          setTokenDetails(details);
        }
      } catch (error) {
        if (active) {
          setTokenDetails(null);
          setTokenDetailsError(
            error instanceof Error ? error.message : "Unable to load token details.",
          );
        }
      } finally {
        if (active) {
          setIsTokenDetailsLoading(false);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [isActionsDrawerOpen]);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      if (!isExamsPage || !isRegistered) {
        if (active) {
          setAllExams([]);
        }
        return;
      }

      try {
        const exams = await fetchExamList({
          walletAddress: activeRole === "student" ? walletAddress ?? undefined : undefined,
        });
        if (active) {
          setAllExams(exams);
        }
      } catch {
        if (active) {
          setAllExams([]);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [activeRole, isExamsPage, isRegistered, walletAddress]);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      if (!walletAddress || !isRegistered || activeRole !== "student") {
        if (active) {
          setEnrolledCourseIds([]);
        }
        return;
      }

      try {
        const courseIds = await fetchEnrolledCourseIds(walletAddress);
        if (active) {
          setEnrolledCourseIds(courseIds);
        }
      } catch {
        if (active) {
          setEnrolledCourseIds([]);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [walletAddress, isRegistered, activeRole]);

  async function handleConnectWallet() {
    try {
      setIsWalletActionLoading(true);
      await connectWallet();
      setStatusMessage("Wallet connected.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Wallet connection failed.",
      );
    } finally {
      setIsWalletActionLoading(false);
    }
  }

  async function handleWalletAction() {
    if (walletAddress) {
      try {
        setIsWalletActionLoading(true);
        await disconnectWallet();
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "Wallet disconnect failed.",
        );
      } finally {
        setIsWalletActionLoading(false);
      }

      return;
    }

    await handleConnectWallet();
  }

  function handleCopyWalletAddress() {
    if (walletAddress) {
      void navigator.clipboard.writeText(walletAddress);
      toast.success("Copied");
    }
  }

  async function handleRegister() {
    if (!walletAddress) {
      setStatusMessage("Connect a wallet first.");
      return;
    }

    const normalizedDisplayName = displayName.trim();
    if (!normalizedDisplayName) {
      setStatusMessage("Enter a display name.");
      return;
    }

    try {
      setIsRegistering(true);
      const user = await registerUser({
        walletAddress,
        role,
        displayName: normalizedDisplayName,
      });

      setRegisteredUser(user);
      setDisplayName(normalizedDisplayName);
      setStatusMessage("Registration complete.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleCreateCourse() {
    if (!walletAddress) {
      setStatusMessage("Connect a wallet before creating a course.");
      return;
    }

    const title = courseForm.title.trim();

    if (!title) {
      setStatusMessage("Enter a course title.");
      return;
    }

    try {
      await createCourse({
        tutorWallet: walletAddress,
        title,
        description: "",
      });

      setCourseForm({ title: "" });
      await refreshCourses();
      setIsCreateCourseModalOpen(false);
      setStatusMessage("Course created.");
    } catch (error) {
      showErrorToast(error, "Unable to create course.");
    }
  }

  async function handleEnrollCourse(courseId: string) {
    if (!walletAddress) {
      setStatusMessage("Connect a wallet first.");
      return;
    }

    if (enrolledCourseIds.includes(courseId)) {
      setStatusMessage("You are already enrolled in this course.");
      return;
    }

    try {
      setIsEnrollingCourseId(courseId);
      await enrollInCourse({ courseId, studentWallet: walletAddress });
      setEnrolledCourseIds((current) => [...current, courseId]);
      setStatusMessage("Course enrolled successfully.");
    } finally {
      setIsEnrollingCourseId(null);
    }
  }

  function resetExamBuilder() {
    setExamCreationMode("manual");
    setQuestions([createEmptyQuestionInput()]);
    setUploadTemplateFileName("");
    setAiConfig({
      questionCount: "5",
      additionalContext: "",
      lectureNotesText: "",
      lectureNotesFileName: "",
    });
  }

  function handleOpenCreateExamDrawer(courseId: string) {
    setSelectedCourseId(courseId);
    setExamForm({
      title: "",
      description: "",
      tokenPrice: "5",
    });
    resetExamBuilder();
    setIsCreateExamDrawerOpen(true);
  }

  function updateQuestion(index: number, updater: (question: QuestionDraft) => QuestionDraft) {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? updater(question) : question,
      ),
    );
  }

  async function handleUploadTemplateFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const templateContent = (await file.text()).trim();

      if (!templateContent) {
        const error = new Error("Upload a completed template before loading questions.");
        console.error("Failed to load exam questions from template.", {
          fileName: file.name,
          reason: error.message,
        });
        setStatusMessage(error.message);
        return;
      }

      const parsedQuestions = parseTemplateQuestions(templateContent);
      setQuestions(parsedQuestions);
      setUploadTemplateFileName(file.name);
      setExamCreationMode("upload");
      setStatusMessage(`${parsedQuestions.length} question(s) loaded from template.`);
    } catch (error) {
      console.error("Failed to load exam questions from template.", {
        fileName: file.name,
        error,
      });
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to parse uploaded questions.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handleLectureNotesFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      let fileText = "";

      if (file.name.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        fileText = result.value;
      } else {
        fileText = await file.text();
      }

      setAiConfig((current) => ({
        ...current,
        lectureNotesText: fileText,
        lectureNotesFileName: file.name,
      }));
    } catch {
      setStatusMessage("Unable to read file. Please use .txt, .md, or .docx files.");
    }
  }

  async function handleGenerateQuestionsWithAi() {
    if (!aiConfig.lectureNotesText.trim()) {
      setStatusMessage("Upload lecture notes before generating questions.");
      return;
    }

    try {
      setIsGeneratingQuestions(true);
      const data = await apiFetch<{ questions: QuestionDraft[] }>("/api/exams/generate", {
        method: "POST",
        body: JSON.stringify({
          lectureNotes: aiConfig.lectureNotesText,
          questionCount: Number(aiConfig.questionCount),
          additionalContext: aiConfig.additionalContext,
        }),
      });

      setQuestions(data.questions);
      setExamCreationMode("ai");
      setStatusMessage(`${data.questions.length} AI-generated question(s) ready for review.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to generate questions with AI.",
      );
    } finally {
      setIsGeneratingQuestions(false);
    }
  }

  async function handleCreateExam() {
    if (!walletAddress || !selectedCourseId) {
      setStatusMessage("Select a course first.");
      return;
    }

    if (!examForm.title.trim() || !examForm.description.trim()) {
      setStatusMessage("Enter the exam title and description.");
      return;
    }

    let normalizedQuestions: QuestionDraft[] = [];

    try {
      normalizedQuestions = questions.map((question) => validateExamQuestionInput(question));
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Each question must be complete.",
      );
      return;
    }

    const provider = getWalletProvider();

    if (!provider) {
      setStatusMessage("Wallet provider unavailable.");
      return;
    }

    try {
      const creationFeeSignature = await payExamCreationFee({
        wallet: provider,
        tutorWallet: walletAddress,
        amountTokens: getClientEnv().examCreationFeeTokens,
      });

      const exam = await createExam({
        tutorWallet: walletAddress,
        courseId: selectedCourseId,
        title: examForm.title.trim(),
        description: examForm.description.trim(),
        creationFeeSignature,
        tokenPrice: Number(examForm.tokenPrice),
        passThresholdPercent: 70,
        questions: normalizedQuestions,
      });

      setSelectedExam(exam);
      setAllExams((current) => [exam, ...current]);
      setExamForm({
        title: "",
        description: "",
        tokenPrice: "5",
      });
      resetExamBuilder();
      setIsCreateExamDrawerOpen(false);
      setStatusMessage(`Exam created. ID: ${exam.id}`);
    } catch (error) {
      showErrorToast(error, "Unable to create exam.");
    }
  }

  async function loadExam(examId: string, options?: { reviewMode?: boolean }) {
    try {
      setIsLoadingExam(true);
      const data = await fetchExam(examId, walletAddress || undefined);
      setSelectedExam(data.exam);
      setExamUnlocked(data.unlocked);
      setLatestSubmission(data.latestSubmission);
      setLatestScore(formatSubmissionScore(data.latestSubmission));
      setIsReviewMode(Boolean(options?.reviewMode && data.latestSubmission));
      setStudentAnswers(
        options?.reviewMode && data.latestSubmission
          ? Object.fromEntries(
              data.latestSubmission.answers.map((answer) => [
                answer.questionId,
                answer.selectedOptionKey,
              ]),
            )
          : {},
      );
      setIsExamDrawerOpen(true);
    } finally {
      setIsLoadingExam(false);
    }
  }

  async function handlePayAndVerify() {
    if (!selectedExam || !walletAddress) {
      return;
    }

    const provider = getWalletProvider();

    if (!provider) {
      setStatusMessage("Wallet provider unavailable.");
      return;
    }

    try {
      const signature = await payForExam({
        wallet: provider,
        studentWallet: walletAddress,
        amountTokens: selectedExam.tokenPrice,
        tutorWallet: selectedExam.tutorWallet,
      });

      setPaymentSignature(signature);
      setStatusMessage("Payment submitted. Verifying on-chain transfer...");

      let verified = false;
      let lastVerifyError: Error | null = null;

      for (let attempt = 0; attempt < PAYMENT_VERIFY_RETRY_COUNT; attempt += 1) {
        try {
          await verifyPayment({
            examId: selectedExam.id,
            studentWallet: walletAddress,
            signature,
          });
          verified = true;
          break;
        } catch (caughtError) {
          lastVerifyError =
            caughtError instanceof Error
              ? caughtError
              : new Error("Unable to verify payment.");
          await sleep(PAYMENT_VERIFY_RETRY_DELAY_MS);
        }
      }

      if (!verified) {
        throw lastVerifyError ?? new Error("Unable to verify payment.");
      }

      setExamUnlocked(true);
      setStatusMessage("Payment verified. Exam unlocked.");
    } catch (error) {
      showErrorToast(error, "Unable to pay and unlock exam.");
    }
  }

  async function handleSwapForExam() {
    if (!selectedExam || !walletAddress) {
      return;
    }

    const provider = getWalletProvider();

    if (!provider) {
      setStatusMessage("Wallet provider unavailable.");
      return;
    }

    try {
      const swap = await swapForExam({
        examId: selectedExam.id,
        studentWallet: walletAddress,
        wallet: provider,
      });

      setStatusMessage(
        swap.confirmed
          ? `Swap confirmed for about ${swap.estimatedOutputTokens} token(s). Balance refreshed. Click "Pay and Unlock" to access the exam.`
          : `Swap submitted for about ${swap.estimatedOutputTokens} token(s). If the balance updates, click "Pay and Unlock" to access the exam.`,
      );

      const balance = await fetchBalance(walletAddress);
      setTokenBalanceDisplay(formatTokenBalance(balance.amountRaw, balance.decimals));
    } catch (error) {
      showErrorToast(error, "Unable to complete swap.");
    }
  }

  async function handleSubmitExam() {
    if (!selectedExam || !walletAddress) {
      return;
    }

    const hasUnansweredQuestions = selectedExam.questions.some(
      (question) => !studentAnswers[question.id],
    );

    if (hasUnansweredQuestions) {
      setStatusMessage("Answer every question before submitting the exam.");
      return;
    }

    setIsSubmittingExam(true);

    const answers = selectedExam.questions.map((question) => ({
      questionId: question.id,
      selectedOptionKey: studentAnswers[question.id],
    }));

    try {
      const result = await submitExam({
        examId: selectedExam.id,
        studentWallet: walletAddress,
        answers,
      });
      let finalizedSubmission = result.submission;
      let submissionProofError = "";
      const provider = getWalletProvider();

      if (!provider) {
        submissionProofError = "Wallet provider unavailable for score proof signing.";
      } else if (!result.submission.scoreProofSignature) {
        try {
          finalizedSubmission = await submitSubmissionProof({
            examId: selectedExam.id,
            submissionId: result.submission.id,
            studentWallet: walletAddress,
            wallet: provider,
            scoreProofMemo: result.submission.scoreProofMemo || result.reward.memo,
          });
          if (finalizedSubmission.scoreProofSignature) {
            toast.success(
              createExplorerToastMessage(
                finalizedSubmission.scoreProofSignature,
                "Score proof saved. View on Solscan:",
              ),
            );
          }
        } catch (error) {
          submissionProofError =
            error instanceof Error ? error.message : "Unable to save score proof on-chain.";
          toast.error(submissionProofError);
        }
      }

      const reviewedExam = await fetchExam(selectedExam.id, walletAddress);

      setLatestSubmission(finalizedSubmission);
      setLatestScore(formatSubmissionScore(finalizedSubmission));
      setSelectedExam({
        ...reviewedExam.exam,
        latestSubmission: finalizedSubmission,
      });
      setExamUnlocked(reviewedExam.unlocked);
      setStudentAnswers(
        Object.fromEntries(
          finalizedSubmission.answers.map((answer) => [answer.questionId, answer.selectedOptionKey]),
        ),
      );
      setIsReviewMode(true);
      setSelectedExam((current) =>
        current
          ? {
              ...current,
              latestSubmission: finalizedSubmission,
            }
          : current,
      );
      setAllExams((current) =>
        current.map((exam) =>
          exam.id === selectedExam.id
            ? {
                ...exam,
                latestSubmission: finalizedSubmission,
              }
            : exam,
        ),
      );
      setStatusMessage(
        submissionProofError
          ? `Exam submitted, but score proof failed: ${submissionProofError}`
          : result.reward.eligible
            ? `Exam submitted. Reward sent: ${result.reward.amountTokens} tokens. Score proof saved on-chain.`
            : "Exam submitted. Score proof saved on-chain.",
      );
      window.location.reload();
    } catch (error) {
      showErrorToast(error, "Unable to submit exam.");
    } finally {
      setIsSubmittingExam(false);
    }
  }

  if (!hydrated) {
    return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]" />;
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="w-full border-b border-[var(--border)] bg-white/95 backdrop-blur">
        <div className="flex w-full flex-col gap-4 px-3 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div>
                <p className="text-lg font-semibold text-[var(--primary-strong)]">
                  Proof
                </p>
                {(isExamsPage || walletAddress || isRegistered) ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#46666c]">
                    <span>{registeredUser?.displayName || displayName || "Not set"}</span>
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full ${
                        activeRole === "tutor"
                          ? "bg-green-500"
                          : "bg-purple-500"
                      }`}
                    />
                    <span className="capitalize">{activeRole}</span>
                  </div>
                ) : null}
              </div>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {(isExamsPage || walletAddress || isRegistered) ? (
              <>
                <span
                  onClick={() => handleCopyWalletAddress()}
                  className="cursor-pointer rounded px-4 py-2 transition hover:bg-[var(--surface-muted)]"
                  role="button"
                  tabIndex={0}
                >
                  {walletAddress ? formatWalletAddress(walletAddress) : "Not connected"}
                </span>
                {walletAddress ? (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[#46666c]">
                     {tokenBalanceDisplay} $B4BAMBO
                  </div>
                ) : null}
              </>
            ) : null}
            {isRegistered ? (
              <Button
                type="default"
                onClick={() => setIsActionsDrawerOpen(true)}
                className="!h-auto !rounded-lg !border-[var(--border)] !px-4 !py-2 !font-medium !text-[var(--primary-strong)] !shadow-none"
              >
                Token Details
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleWalletAction()}
              disabled={isWalletActionLoading}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isWalletActionLoading ? (walletAddress ? "Disconnecting..." : "Connecting...") : (walletAddress ? "Disconnect Wallet" : "Connect Wallet")}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
        <section />

        {!isExamsPage ? (
          <>
            {!walletAddress ? (
              <Surface className="mx-auto flex min-h-[55vh] w-full max-w-xl items-center justify-center">
                <button
                  type="button"
                  onClick={() => void handleConnectWallet()}
                  disabled={isWalletActionLoading}
                  className="rounded-lg bg-[var(--primary)] px-8 py-4 text-base font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isWalletActionLoading ? "Connecting..." : "Connect Wallet"}
                </button>
              </Surface>
            ) : !isRegistered ? (
              <Surface className="mx-auto flex min-h-[55vh] w-full items-center justify-center">
                <div className="w-full max-w-lg rounded-xl border border-[rgba(18,60,68,0.1)] bg-white p-6 shadow-[0_28px_70px_rgba(15,35,41,0.14)] sm:p-7">
                  <div className="border-b border-[var(--border)] pb-4">
                 
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--primary-strong)]">
                      Complete registration
                    </h2>
                    <p className="mt-1 text-sm text-[#5a787d]">
                      Add your details to continue into the platform.
                    </p>
                  </div>

                  <form
                    className="mt-5 grid gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleRegister();
                    }}
                  >
                    <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                      Display name
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Enter your display name"
                        required
                        minLength={1}
                        className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--primary)]"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                      Role
                      <select
                        value={role}
                        onChange={(event) => setRole(event.target.value as UserRole)}
                        className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--primary)]"
                      >
                        <option value="student">Student</option>
                        <option value="tutor">Tutor</option>
                      </select>
                    </label>

                    <button
                      type="submit"
                      disabled={isRegistering}
                      className="mt-2 rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isRegistering ? "Registering..." : "Register"}
                    </button>
                  </form>
                </div>
              </Surface>
            ) : (
              <Surface className="mx-auto w-full max-w-5xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                  
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--primary-strong)]">
                      Available courses
                    </h2>
                
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {activeRole === "tutor" ? (
                      <Button
                        type="primary"
                        onClick={() => setIsCreateCourseModalOpen(true)}
                        className="!h-auto !rounded-lg !bg-[var(--primary)] !px-4 !py-2 !font-semibold !shadow-none"
                      >
                        Create Course
                      </Button>
                    ) : null}
                    <Link
                      href="/exams"
                      className="inline-flex items-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                    >
                      Go to Exams
                    </Link>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
                  {coursesLoading ? <p className="text-sm text-[#5a787d]">Loading courses...</p> : null}
                  {!coursesLoading && courses.length === 0 ? (
                    <p className="flex items-center justify-center rounded-xl px-4 py-8 text-sm text-[#46666c] sm:col-span-2 xl:col-span-4">
                      No courses yet.
                    </p>
                  ) : null}
                  {courses.map((course: Course) => (
                    <article
                      key={course.id}
                      className="min-h-50 rounded-xl border border-[var(--border)] bg-white p-7"
                    >
                      <h3 className="text-xl font-semibold text-[var(--primary-strong)]">
                        {course.title}
                      </h3>
                      <p className="mt-3 text-sm font-medium text-[#46666c]">
                        {course.tutorName || "Unknown tutor"}
                      </p>
                      <p className="mt-1 text-xs text-[#6c878c]">
                        {formatWalletAddress(course.tutorWallet)}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[#46666c]">
                        {course.description}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        {activeRole === "student" ? (
                          <button
                            type="button"
                            onClick={() => void handleEnrollCourse(course.id)}
                            disabled={
                              isEnrollingCourseId === course.id
                              || enrolledCourseIds.includes(course.id)
                            }
                            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {enrolledCourseIds.includes(course.id)
                              ? "Enrolled"
                              : isEnrollingCourseId === course.id
                                ? "Enrolling..."
                                : "Enroll"}
                          </button>
                        ) : null}
                        {activeRole === "tutor" && course.tutorWallet === walletAddress ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCreateExamDrawer(course.id)}
                            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                          >
                            Add Exam
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </Surface>
            )}
          </>
        ) : (
          <Surface className="mx-auto flex w-full max-w-6xl flex-col items-center">
            <div className="mb-6 flex w-full max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
              <h2 className="text-3xl font-semibold text-[var(--primary-strong)]">
                Exams
              </h2>
              <Link
                href="/"
                className="inline-flex items-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
              >
                Back to Courses
              </Link>
            </div>
            <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              {allExams.length > 0 ? (
                allExams.map((exam) => {
                  const relatedCourse = courses.find((course) => course.id === exam.courseId);
                  const isStudentEnrolled = enrolledCourseIds.includes(exam.courseId);
                  const isTutorOwner = exam.tutorWallet === walletAddress;
                  const isTutorBlocked = activeRole === "tutor" && !isTutorOwner;
                  const hasSubmittedExam = Boolean(exam.latestSubmission);
                  const cardLatestScore = formatSubmissionScore(exam.latestSubmission);
                  const buttonLabel =
                    activeRole === "student"
                      ? isStudentEnrolled
                          ? "Take Exam"
                          : "Enroll to Take"
                      : isTutorOwner
                        ? "Open Exam"
                        : "Only Creator Can Open";

                  return (
                    <article
                      key={exam.id}
                      className="rounded-xl border border-[var(--border)] bg-white p-6"
                    >
                      <h3 className="mt-2 text-xl font-semibold text-[var(--primary-strong)]">
                        {exam.title}
                      </h3>
                      <p className="mt-3 text-sm font-medium text-[#46666c]">
                        {relatedCourse?.tutorName || formatWalletAddress(exam.tutorWallet)}
                      </p>
                      <p className="mt-1 text-xs text-[#6c878c]">
                        {formatWalletAddress(exam.tutorWallet)}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[#46666c]">{exam.description}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[#5a787d]">
                        Access fee: {exam.tokenPrice} $B4BAMBO
                      </p>
                      {cardLatestScore ? (
                        <p className="mt-3 text-sm text-[#46666c]">
                           Score: {cardLatestScore}
                        </p>
                      ) : null}
          
                      <div className="mt-5 flex flex-wrap gap-3">
                        {!(activeRole === "student" && hasSubmittedExam) ? (
                          <button
                            type="button"
                            onClick={() => void loadExam(exam.id)}
                            disabled={
                              (activeRole === "student" && !isStudentEnrolled) || isTutorBlocked || isLoadingExam
                            }
                            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:bg-[#9ab3b8]"
                          >
                            {isLoadingExam ? "Loading..." : buttonLabel}
                          </button>
                        ) : null}
                        {activeRole === "student" && exam.latestSubmission ? (
                          <div className="flex justify-start gap-2 items-center">
                            <button
                              type="button"
                              onClick={() => void loadExam(exam.id, { reviewMode: true })}
                              className="rounded-lg border border-[var(--primary)] bg-white p-2 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
                            >
                              View Past Questions
                            </button>
                            {exam.latestSubmission?.scoreProofSignature ? (
                              <a
                                href={buildSolscanTxUrl(exam.latestSubmission.scoreProofSignature)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg bg-[var(--primary)] p-2 text-xs font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                              >
                                View On Chain Proof
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="rounded-xl px-4 py-8 text-sm text-[#46666c] lg:col-span-2 2xl:col-span-3">
                  No exams available yet.
                </p>
              )}
            </div>
          </Surface>
        )}
      </div>

      <Drawer
        title="Token details"
        placement="right"
        onClose={() => setIsActionsDrawerOpen(false)}
        open={isActionsDrawerOpen}
        width={460}
      >
        <div className="grid gap-6">
          <a
            href={BAGS_TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border-2 border-[var(--primary)] bg-white px-4 py-3 text-sm font-medium text-[var(--primary)] transition hover:border-[var(--primary-strong)] hover:bg-[var(--primary-soft)]"
          >
            Buy token on Bags
          </a>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--primary)]">
                  Token details
                </p>
                <p className="mt-1 text-sm text-[#46666c]">
                  Live data from Bags
                </p>
              </div>
              {isTokenDetailsLoading ? (
                <span className="text-xs font-medium text-[#5a787d]">Loading...</span>
              ) : null}
            </div>

            {tokenDetailsError ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-white px-3 py-3 text-sm text-[#9a3d3d]">
                {tokenDetailsError}
              </div>
            ) : null}

            {!isTokenDetailsLoading && !tokenDetailsError && tokenDetails?.entries.length ? (
              <div className="mt-4 grid gap-3">
                {tokenDetails.pfpUrl ? (
                  <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#5a787d]">
                      Profile picture
                    </p>
                    <div className="mt-3">
                      <Image
                        src={tokenDetails.pfpUrl}
                        alt="Bags token creator profile picture"
                        width={72}
                        height={72}
                        unoptimized
                        className="h-[72px] w-[72px] rounded-full border border-[var(--border)] object-cover"
                      />
                    </div>
                  </div>
                ) : null}
                {tokenDetails.entries.map((entry) => (
                  <div
                    key={entry.label}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-3"
                  >
                    <p className="text-xs uppercase tracking-[0.14em] text-[#5a787d]">
                      {entry.label}
                    </p>
                    <p className="mt-1 break-words text-sm font-medium text-[var(--primary-strong)]">
                      {entry.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {!isTokenDetailsLoading && !tokenDetailsError && !tokenDetails?.entries.length ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-white px-3 py-3 text-sm text-[#46666c]">
                No token details available.
              </div>
            ) : null}
          </div>
        </div>
      </Drawer>

      <Drawer
        title={
          selectedExam ? (
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--primary)]">
                Access fee: {selectedExam.tokenPrice} $B4BAMBO
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--primary-strong)]">
                {selectedExam.title}
              </h2>
            </div>
          ) : "Exam"
        }
        placement="right"
        onClose={() => setIsExamDrawerOpen(false)}
        open={isExamDrawerOpen}
        width={1000}
      >
        {selectedExam ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-[var(--surface-muted)] p-5">
              <p className="text-sm leading-6 text-[#46666c]">
                {selectedExam.description}
              </p>
              <p className="mt-3 text-sm text-[#46666c]">
                Access: {isTutorViewingOwnExam ? "Creator preview" : examUnlocked ? "Unlocked" : "Payment required"}
              </p>
              <p className="text-sm text-[#46666c]">
                 Score: {latestScore || "No submission yet"}
              </p>
              {activeRole === "student" && latestSubmission ? (
                <p className="mt-1 text-sm text-[#46666c]">
                  Mode: Reviewing past submission
                </p>
              ) : null}
            </div>

            {!examUnlocked && !isTutorViewingOwnExam ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] p-5">
                <p className="text-sm leading-6 text-[var(--primary-strong)]">
                  If your balance is low, buy or swap enough tokens, then unlock the exam.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={BAGS_TOKEN_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--primary)] bg-white px-3 py-1 text-sm font-semibold !text-[var(--primary)] transition hover:border-[var(--primary-strong)] hover:bg-[var(--primary-soft)]"
                  >
                    Buy on Bags
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleSwapForExam()}
                    disabled={isSwapping}
                    className="rounded-lg border border-[var(--primary)] bg-white px-3 py-1 text-sm font-semibold text-[var(--primary)] transition hover:bg-[var(--surface)] disabled:opacity-60"
                  >
                    {isSwapping ? "Swapping..." : "Swap Enough for Exam"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePayAndVerify()}
                    disabled={isPaying || isVerifying || isSwapping}
                    className="rounded-lg bg-[var(--primary-strong)] px-3 py-1 text-sm font-semibold text-white transition hover:bg-[var(--primary)] disabled:opacity-60"
                  >
                    Pay and Unlock
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedExam.questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="rounded-xl border border-[var(--border)] p-4"
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                      Question {index + 1}
                    </p>
                    <p className="font-medium text-[var(--primary-strong)]">
                      {question.prompt}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {OPTION_KEYS.map((optionKey) => (
                        (() => {
                          const selectedOption = studentAnswers[question.id];
                          const isSelected = selectedOption === optionKey;
                          const isCorrect = question.correctOptionKey === optionKey;
                          const reviewClass = isReviewMode
                            ? isCorrect
                              ? "border-green-600 bg-green-50 text-green-900"
                              : isSelected
                                ? "border-red-500 bg-red-50 text-red-900"
                                : "border-[var(--border)] text-[#35575d]"
                            : isSelected
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--border)] text-[#35575d] hover:border-[var(--primary)]";

                          return (
                        <button
                          key={`${question.id}-${optionKey}`}
                          type="button"
                          onClick={
                            isTutorViewingOwnExam || isReviewMode
                              ? undefined
                              : () =>
                                  setStudentAnswers((current) => ({
                                    ...current,
                                    [question.id]: optionKey,
                                  }))
                          }
                          disabled={isTutorViewingOwnExam || isReviewMode}
                          className={`rounded-lg border px-4 py-3 text-left transition ${reviewClass} ${
                            isTutorViewingOwnExam || isReviewMode
                              ? "cursor-default hover:border-current disabled:opacity-100"
                              : ""
                          }`}
                        >
                          <span className="font-semibold">{optionKey}.</span>{" "}
                          {question.options[optionKey]}
                          {isReviewMode && isSelected ? (
                            <span className="ml-2 text-xs font-semibold uppercase tracking-[0.14em]">
                              Your answer
                            </span>
                          ) : null}
                          {isReviewMode && isCorrect ? (
                            <span className="ml-2 text-xs font-semibold uppercase tracking-[0.14em]">
                              Correct
                            </span>
                          ) : null}
                        </button>
                          );
                        })()
                      ))}
                    </div>
                  </div>
                ))}
                {!isTutorViewingOwnExam ? (
                  <div className="flex flex-wrap gap-3">
                    {!isReviewMode && !latestSubmission ? (
                      <button
                        type="button"
                        onClick={() => void handleSubmitExam()}
                        disabled={isSubmittingExam}
                        className="rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isSubmittingExam ? "Submitting..." : "Submit Exam"}
                      </button>
                    ) : null}
                    {latestSubmission ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsReviewMode(true);
                          setStudentAnswers(
                            Object.fromEntries(
                              latestSubmission.answers.map((answer) => [
                                answer.questionId,
                                answer.selectedOptionKey,
                              ]),
                            ),
                          );
                        }}
                        className="rounded-lg border border-[var(--primary)] bg-white px-5 py-3 font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
                      >
                        View Past Questions
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title={
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              Exam setup
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--primary-strong)]">
              Add exam
            </h2>
            <p className="mt-1 text-sm text-[#5a787d]">
              {selectedCourseTitle || "Select a course"}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#5a787d]">
              Publish fee: {getClientEnv().examCreationFeeTokens} $B4BAMBO
            </p>
          </div>
        }
        placement="right"
        onClose={() => setIsCreateExamDrawerOpen(false)}
        open={isCreateExamDrawerOpen}
        width={1000}
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
            <span>
              Exam title <span className="text-red-500">*</span>
            </span>
            <Input
              value={examForm.title}
              onChange={(event) =>
                setExamForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Enter exam title"
              size="large"
              className="!rounded-lg"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
            <span>
              Description <span className="text-red-500">*</span>
            </span>
            <TextArea
              value={examForm.description}
              onChange={(event) =>
                setExamForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Enter exam description"
              autoSize={{ minRows: 3, maxRows: 6 }}
              className="!rounded-lg"
            />
          </label>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
              <span>
                Exam access fee <span className="text-red-500">*</span> ($B4BAMBO)
              </span>
              <Input
                value={examForm.tokenPrice}
                onChange={(event) =>
                  setExamForm((current) => {
                    const nextValue = event.target.value.trim();

                    if (!nextValue) {
                      return {
                        ...current,
                        tokenPrice: "",
                      };
                    }

                    const parsedValue = Number(nextValue);

                    if (!Number.isFinite(parsedValue)) {
                      return current;
                    }

                    return {
                      ...current,
                      tokenPrice: String(Math.min(parsedValue, 20_000)),
                    };
                  })
                }
                placeholder="5"
                inputMode="decimal"
                max={20000}
                size="large"
                className="!rounded-lg !text-lg !py-3"
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "manual", label: "Manual Input" },
                { key: "upload", label: "Upload from Template" },
                { key: "ai", label: "Generate with AI" },
              ].map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setExamCreationMode(mode.key as ExamCreationMode)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    examCreationMode === mode.key
                      ? "bg-[var(--primary)] text-white"
                      : "border border-[var(--border)] bg-white text-[var(--primary)]"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {examCreationMode === "manual" ? (
              <div className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[#46666c]">
                Add questions one by one. Every question must include option A, option B,
                option C, and option D. Choose the correct answer with the select input.
              </div>
            ) : null}

            {examCreationMode === "upload" ? (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="/exam-question-template.txt"
                    download
                    className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold !text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                  >
                    Download Template
                  </a>
                  <label className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]">
                    Upload Filled Template
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={(event) => void handleUploadTemplateFile(event)}
                      className="hidden"
                    />
                  </label>
                  {uploadTemplateFileName ? (
                    <span className="text-sm text-[#5a787d]">{uploadTemplateFileName}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {examCreationMode === "ai" ? (
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                    Number of questions
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={aiConfig.questionCount}
                      onChange={(event) =>
                        setAiConfig((current) => ({
                          ...current,
                          questionCount: event.target.value,
                        }))
                      }
                      size="large"
                      className="!rounded-lg"
                    />
                  </label>
                  <div className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                    <span>Lecture notes file</span>
                    <label className="cursor-pointer rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[var(--primary)]">
                      {aiConfig.lectureNotesFileName || "Upload lecture notes (.txt, .md, or .docx)"}
                      <input
                        type="file"
                        accept=".txt,.md,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event) => void handleLectureNotesFile(event)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                  Additional AI context
                  <TextArea
                    value={aiConfig.additionalContext}
                    onChange={(event) =>
                      setAiConfig((current) => ({
                        ...current,
                        additionalContext: event.target.value,
                      }))
                    }
                    placeholder="Add the difficulty level, focus areas, or any instructions for the AI."
                    autoSize={{ minRows: 4, maxRows: 8 }}
                    className="!rounded-lg"
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    type="default"
                    loading={isGeneratingQuestions}
                    onClick={() => void handleGenerateQuestionsWithAi()}
                    className="!h-auto !rounded-lg !border-[var(--border)] !px-5 !py-2.5 !font-semibold !text-[var(--primary)] !shadow-none"
                  >
                    Generate Questions with AI
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4">
            {questions.map((question, index) => (
              <div
                key={`drawer-question-${index}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/70 p-4"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                    Question {index + 1}
                  </p>
                  {questions.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setQuestions((current) =>
                          current.filter((_, questionIndex) => questionIndex !== index),
                        )
                      }
                      className="text-sm font-semibold text-[#9a3d3d]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                  Question prompt
                  <Input
                    value={question.prompt}
                    onChange={(event) =>
                      updateQuestion(index, (current) => ({
                        ...current,
                        prompt: event.target.value,
                      }))
                    }
                    placeholder="Enter question prompt"
                    size="large"
                    className="!rounded-lg"
                  />
                </label>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {OPTION_KEYS.map((optionKey) => (
                    <label
                      key={`question-${index}-option-${optionKey}`}
                      className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]"
                    >
                      Option {optionKey}
                      <Input
                        value={question.options[optionKey]}
                        onChange={(event) =>
                          updateQuestion(index, (current) => ({
                            ...current,
                            options: {
                              ...current.options,
                              [optionKey]: event.target.value,
                            },
                          }))
                        }
                        placeholder={`Enter option ${optionKey}`}
                        size="large"
                        className="!rounded-lg"
                      />
                    </label>
                  ))}
                </div>
                <label className="mt-4 grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                  Correct answer
                  <select
                    value={question.correctOptionKey}
                    onChange={(event) =>
                      updateQuestion(index, (current) => ({
                        ...current,
                        correctOptionKey: event.target.value as OptionKey,
                      }))
                    }
                    className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--primary)]"
                  >
                    {OPTION_KEYS.map((optionKey) => (
                      <option key={`answer-${index}-${optionKey}`} value={optionKey}>
                        Option {optionKey}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <Button
              type="default"
              onClick={() => setQuestions((current) => [...current, createEmptyQuestionInput()])}
              className="!h-auto !rounded-lg !border-[var(--border)] !px-5 !py-2.5 !font-semibold !text-[var(--primary)] !shadow-none"
            >
              Add Question
            </Button>
            <Button
              type="primary"
              loading={examLoading || isPayingFee}
              onClick={() => void handleCreateExam()}
              className="!h-auto !rounded-lg !bg-[var(--primary)] !px-5 !py-2.5 !font-semibold !shadow-none"
            >
              {isPayingFee ? "Creating" : "Create Exam"}
            </Button>
          </div>
        </div>
      </Drawer>

      <Modal
        title={
          <div className="border-b border-[var(--border)] pb-4">
            <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">
              Create course
            </h2>
          </div>
        }
        open={isCreateCourseModalOpen}
        onCancel={() => setIsCreateCourseModalOpen(false)}
        footer={null}
        styles={{
          body: {
            paddingTop: 28,
          },
        }}
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
            Course title
            <Input
              value={courseForm.title}
              onChange={(event) =>
                setCourseForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Enter course title"
              size="large"
              className="!rounded-lg !text-lg !py-3"
            />
          </label>
          <div className="flex justify-end">
            <Button
              type="primary"
              loading={courseSubmitting}
              onClick={() => void handleCreateCourse()}
              className="!h-auto !rounded-lg !bg-[var(--primary)] !px-5 !py-2.5 !font-semibold !shadow-none"
            >
              Create course
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
