"use client";

import { Button, Drawer, Input, Modal } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";

import { useCourses } from "@/hooks/useCourses";
import { useCreateCourse } from "@/hooks/useCreateCourse";
import { useExams } from "@/hooks/useExams";
import { usePayment } from "@/hooks/usePayment";
import { useVerifyPayment } from "@/hooks/useVerifyPayment";
import { useBagsSwap } from "@/hooks/useBagsSwap";
import { useWalletSession } from "@/components/wallet-session-provider";
import { apiFetch } from "@/lib/client-api";
import {
  createEmptyQuestionInput,
  OPTION_KEYS,
  parseTemplateQuestions,
  validateExamQuestionInput,
  type ExamQuestionInput,
  type OptionKey,
} from "@/lib/exam-questions";
import type { Course, Exam, PlatformUser, UserRole } from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

type QuestionDraft = ExamQuestionInput;
type ExamCreationMode = "manual" | "upload" | "ai";
const BAGS_TOKEN_URL = "https://bags.fm/$BELLOBAMBO";

function formatWalletAddress(walletAddress: string) {
  if (walletAddress.length <= 10) {
    return walletAddress;
  }

  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

function getWalletProvider(): SolanaProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.phantom?.solana ?? window.solana ?? null;
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

function formatTokenBalance(amountRaw: string, decimals: number) {
  const normalizedRaw = amountRaw.replace(/^0+/, "") || "0";

  if (decimals <= 0) {
    return normalizedRaw;
  }

  const paddedRaw = normalizedRaw.padStart(decimals + 1, "0");
  const whole = paddedRaw.slice(0, -decimals) || "0";
  const fraction = paddedRaw.slice(-decimals).padEnd(Math.max(decimals, 12), "0");

  return `${whole}.${fraction}`;
}

async function fetchExamList(filters?: { courseId?: string; tutorWallet?: string }) {
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
  const { verifyPayment, isVerifying } = useVerifyPayment();
  const { swapForExam, isSwapping } = useBagsSwap();
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
  const [paymentSignature, setPaymentSignature] = useState("");
  const [tokenBalanceDisplay, setTokenBalanceDisplay] = useState("Unavailable");
  const [statusMessage, setStatusMessage] = useState("");
  const [isActionsDrawerOpen, setIsActionsDrawerOpen] = useState(false);
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [isCreateExamDrawerOpen, setIsCreateExamDrawerOpen] = useState(false);
  const [isExamDrawerOpen, setIsExamDrawerOpen] = useState(false);
  const [isEnrollingCourseId, setIsEnrollingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
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
  const isRegistered = Boolean(registeredUser);
  const activeRole = registeredUser?.role ?? role;
  const selectedCourseTitle = courses.find((course) => course.id === selectedCourseId)?.title;
  const isTutorViewingOwnExam = Boolean(
    selectedExam && activeRole === "tutor" && selectedExam.tutorWallet === walletAddress,
  );

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

    void Promise.resolve().then(async () => {
      if (!isExamsPage || !isRegistered) {
        if (active) {
          setAllExams([]);
        }
        return;
      }

      try {
        const exams = await fetchExamList();
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
  }, [isExamsPage, isRegistered]);

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
      await connectWallet();
      setStatusMessage("Wallet connected.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Wallet connection failed.",
      );
    }
  }

  async function handleWalletAction() {
    if (walletAddress) {
      try {
        await disconnectWallet();
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "Wallet disconnect failed.",
        );
      }

      return;
    }

    await handleConnectWallet();
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

    const user = await registerUser({
      walletAddress,
      role,
      displayName: normalizedDisplayName,
    });

    setRegisteredUser(user);
    setDisplayName(normalizedDisplayName);
    setStatusMessage("Registration complete.");
  }

  async function handleCreateCourse() {
    if (!walletAddress) {
      setStatusMessage("Connect a wallet before creating a course.");
      return;
    }

    const title = courseForm.title.trim();
    const description = courseForm.description.trim();

    if (!title) {
      setStatusMessage("Enter a course title.");
      return;
    }

    await createCourse({
      tutorWallet: walletAddress,
      title,
      description,
    });

    setCourseForm({ title: "", description: "" });
    await refreshCourses();
    setIsCreateCourseModalOpen(false);
    setStatusMessage("Course created.");
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

    const fileText = await file.text();
    setAiConfig((current) => ({
      ...current,
      lectureNotesText: fileText,
      lectureNotesFileName: file.name,
    }));
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

    const exam = await createExam({
      tutorWallet: walletAddress,
      courseId: selectedCourseId,
      title: examForm.title.trim(),
      description: examForm.description.trim(),
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
  }

  async function loadExam(examId: string) {
    const data = await fetchExam(examId, walletAddress || undefined);
    setSelectedExam(data.exam);
    setExamUnlocked(data.unlocked);
    setLatestScore(
      data.latestSubmission
        ? `${data.latestSubmission.scorePercent}% (${data.latestSubmission.correctAnswers}/${data.latestSubmission.totalQuestions})`
        : "",
    );
    setStudentAnswers({});
    setIsExamDrawerOpen(true);
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

    const signature = await payForExam({
      wallet: provider,
      studentWallet: walletAddress,
      amountTokens: selectedExam.tokenPrice,
    });

    setPaymentSignature(signature);

    await verifyPayment({
      examId: selectedExam.id,
      studentWallet: walletAddress,
      signature,
    });

    setExamUnlocked(true);
    setStatusMessage("Payment verified. Exam unlocked.");
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

    const swap = await swapForExam({
      examId: selectedExam.id,
      studentWallet: walletAddress,
      wallet: provider,
    });

    setStatusMessage(
      `Swap confirmed for about ${swap.estimatedOutputTokens} token(s). Refreshing balance...`,
    );

    const balance = await fetchBalance(walletAddress);
    setTokenBalanceDisplay(formatTokenBalance(balance.amountRaw, balance.decimals));
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

    const answers = selectedExam.questions.map((question) => ({
      questionId: question.id,
      selectedOptionKey: studentAnswers[question.id],
    }));

    const result = await submitExam({
      examId: selectedExam.id,
      studentWallet: walletAddress,
      answers,
    });

    setLatestScore(
      `${result.submission.scorePercent}% (${result.submission.correctAnswers}/${result.submission.totalQuestions})`,
    );
    setStatusMessage(
      result.reward.eligible
        ? `Exam submitted. Reward sent: ${result.reward.amountTokens} tokens.`
        : "Exam submitted.",
    );
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
                <span className="px-4 py-2">
                  {walletAddress ? formatWalletAddress(walletAddress) : "Not connected"}
                </span>
                {walletAddress ? (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[#46666c]">
                    BAGS balance: {tokenBalanceDisplay}
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
                Open Drawer
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleWalletAction()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)]"
            >
              {walletAddress ? "Disconnect Wallet" : "Connect Wallet"}
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
                  className="rounded-lg bg-[var(--primary)] px-8 py-4 text-base font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                >
                  Connect Wallet
                </button>
              </Surface>
            ) : !isRegistered ? (
              <Surface className="mx-auto flex min-h-[55vh] w-full items-center justify-center">
                <div className="w-full max-w-lg rounded-xl border border-[rgba(18,60,68,0.1)] bg-white p-6 shadow-[0_28px_70px_rgba(15,35,41,0.14)] sm:p-7">
                  <div className="border-b border-[var(--border)] pb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">
                      Account setup
                    </p>
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
                      className="mt-2 rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                    >
                      Register
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
                    <p className="mt-2 text-sm text-[#5a787d]">
                      Browse the courses already fetched from the backend.
                    </p>
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
                        {relatedCourse?.title || "Course"} • Access fee: {exam.tokenPrice} token(s)
                      </p>
          
                      <div className="mt-5">
                        <button
                          type="button"
                          onClick={() => void loadExam(exam.id)}
                          disabled={
                            (activeRole === "student" && !isStudentEnrolled) || isTutorBlocked
                          }
                          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:bg-[#9ab3b8]"
                        >
                          {buttonLabel}
                        </button>
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
        title="Quick actions"
        placement="right"
        onClose={() => setIsActionsDrawerOpen(false)}
        open={isActionsDrawerOpen}
        width={360}
      >
        <div className="grid gap-6">
          <Link
            href="/exams"
            onClick={() => setIsActionsDrawerOpen(false)}
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[var(--primary-strong)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
          >
            Open exam workspace
          </Link>
          {activeRole === "tutor" && !isExamsPage ? (
            <button
              type="button"
              onClick={() => {
                setIsActionsDrawerOpen(false);
                setIsCreateCourseModalOpen(true);
              }}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-left text-sm font-medium text-[var(--primary-strong)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
            >
              Create a new course
            </button>
          ) : null}
          <a
            href={BAGS_TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border-2 border-[var(--primary)] bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white transition hover:border-[var(--primary-strong)] hover:bg-[var(--primary-strong)]"
          >
            Buy token on Bags
          </a>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[#46666c]">
            Selected course: {selectedCourseTitle || "None"}
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[#46666c]">
            Token balance: {tokenBalanceDisplay}
          </div>
          {statusMessage ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--primary-soft)] px-4 py-3 text-sm text-[var(--primary-strong)]">
              {statusMessage}
            </div>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        title={
          selectedExam ? (
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--primary)]">
                Access fee: {selectedExam.tokenPrice} token(s)
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
                Latest score: {latestScore || "No submission yet"}
              </p>
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
                    className="rounded-lg border-2 border-[var(--primary)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:border-[var(--primary-strong)] hover:bg-[var(--primary-strong)]"
                  >
                    Buy on Bags
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleSwapForExam()}
                    disabled={isSwapping}
                    className="rounded-lg border border-[var(--primary)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:bg-[var(--surface)] disabled:opacity-60"
                  >
                    {isSwapping ? "Swapping..." : "Swap Enough for Exam"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePayAndVerify()}
                    disabled={isPaying || isVerifying || isSwapping}
                    className="rounded-lg bg-[var(--primary-strong)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary)] disabled:opacity-60"
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
                        <button
                          key={`${question.id}-${optionKey}`}
                          type="button"
                          onClick={
                            isTutorViewingOwnExam
                              ? undefined
                              : () =>
                                  setStudentAnswers((current) => ({
                                    ...current,
                                    [question.id]: optionKey,
                                  }))
                          }
                          disabled={isTutorViewingOwnExam}
                          className={`rounded-lg border px-4 py-3 text-left transition ${
                            studentAnswers[question.id] === optionKey
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--border)] text-[#35575d] hover:border-[var(--primary)]"
                          } ${isTutorViewingOwnExam ? "cursor-default hover:border-[var(--border)] disabled:opacity-100" : ""}`}
                        >
                          <span className="font-semibold">{optionKey}.</span>{" "}
                          {question.options[optionKey]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!isTutorViewingOwnExam ? (
                  <button
                    type="button"
                    onClick={() => void handleSubmitExam()}
                    className="rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                  >
                    Submit Exam
                  </button>
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
          </div>
        }
        placement="right"
        onClose={() => setIsCreateExamDrawerOpen(false)}
        open={isCreateExamDrawerOpen}
        width={1000}
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
            Exam title
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
            Description
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
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
              Exam access fee
              <Input
                value={examForm.tokenPrice}
                onChange={(event) =>
                  setExamForm((current) => ({
                    ...current,
                    tokenPrice: event.target.value,
                  }))
                }
                placeholder="5"
                size="large"
                className="!rounded-lg"
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
                    className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
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
                      {aiConfig.lectureNotesFileName || "Upload lecture notes (.txt or .md)"}
                      <input
                        type="file"
                        accept=".txt,.md"
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
                <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
                  Lecture notes preview
                  <TextArea
                    value={aiConfig.lectureNotesText}
                    onChange={(event) =>
                      setAiConfig((current) => ({
                        ...current,
                        lectureNotesText: event.target.value,
                      }))
                    }
                    placeholder="Paste lecture notes here if you prefer not to upload a file."
                    autoSize={{ minRows: 8, maxRows: 16 }}
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
              loading={examLoading}
              onClick={() => void handleCreateExam()}
              className="!h-auto !rounded-lg !bg-[var(--primary)] !px-5 !py-2.5 !font-semibold !shadow-none"
            >
              Create Exam
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
              className="!rounded-lg"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-[var(--primary-strong)]">
            Description
            <TextArea
              value={courseForm.description}
              onChange={(event) =>
                setCourseForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Enter course description"
              autoSize={{ minRows: 4, maxRows: 7 }}
              className="!rounded-lg"
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
