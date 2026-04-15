"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useCourses } from "@/hooks/useCourses";
import { useCreateCourse } from "@/hooks/useCreateCourse";
import { useExams } from "@/hooks/useExams";
import { usePayment } from "@/hooks/usePayment";
import { useVerifyPayment } from "@/hooks/useVerifyPayment";
import { useBagsSwap } from "@/hooks/useBagsSwap";
import { useWalletSession } from "@/components/wallet-session-provider";
import { apiFetch } from "@/lib/client-api";
import { getClientEnv } from "@/lib/env";
import type { Course, Exam, PlatformUser, UserRole } from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

type QuestionDraft = {
  prompt: string;
  options: string;
  correctOptionIndex: number;
};

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

export function PlatformApp() {
  const pathname = usePathname();
  const clientEnv = getClientEnv();
  const isExamsPage = pathname === "/exams";
  const { courses, refresh: refreshCourses, isLoading: coursesLoading } = useCourses();
  const { createCourse, isSubmitting: courseSubmitting } = useCreateCourse();
  const {
    createExam,
    fetchExam,
    fetchExams,
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
  const [courseExams, setCourseExams] = useState<Exam[]>([]);
  const [examUnlocked, setExamUnlocked] = useState(false);
  const [latestScore, setLatestScore] = useState("");
  const [paymentSignature, setPaymentSignature] = useState("");
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
  });
  const [examForm, setExamForm] = useState({
    title: "",
    description: "",
    tokenPrice: "5",
    passThresholdPercent: "70",
  });
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    {
      prompt: "",
      options: "Option A\nOption B\nOption C\nOption D",
      correctOptionIndex: 0,
    },
  ]);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!walletAddress) {
      setTokenBalance(null);
      return;
    }

    void fetchBalance(walletAddress)
      .then((balance) => setTokenBalance(balance.amount))
      .catch(() => setTokenBalance(null));
  }, [walletAddress, paymentSignature]);

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

    const user = await registerUser({
      walletAddress,
      role,
      displayName,
    });

    setRegisteredUser(user);
    setStatusMessage("Registration complete.");
  }

  async function handleCreateCourse() {
    if (!walletAddress) {
      setStatusMessage("Connect a wallet before creating a course.");
      return;
    }

    await createCourse({
      tutorWallet: walletAddress,
      title: courseForm.title,
      description: courseForm.description,
    });

    setCourseForm({ title: "", description: "" });
    await refreshCourses();
    setStatusMessage("Course created.");
  }

  async function handleCreateExam() {
    if (!walletAddress || !selectedCourseId) {
      setStatusMessage("Select a course first.");
      return;
    }

    const exam = await createExam({
      tutorWallet: walletAddress,
      courseId: selectedCourseId,
      title: examForm.title,
      description: examForm.description,
      tokenPrice: Number(examForm.tokenPrice),
      passThresholdPercent: Number(examForm.passThresholdPercent),
      questions: questions.map((question) => ({
        prompt: question.prompt,
        options: question.options
          .split("\n")
          .map((option) => option.trim())
          .filter(Boolean),
        correctOptionIndex: question.correctOptionIndex,
      })),
    });

    setSelectedExam(exam);
    setCourseExams((current) => [exam, ...current]);
    setExamForm({
      title: "",
      description: "",
      tokenPrice: "5",
      passThresholdPercent: "70",
    });
    setQuestions([
      {
        prompt: "",
        options: "Option A\nOption B\nOption C\nOption D",
        correctOptionIndex: 0,
      },
    ]);
    setStatusMessage(`Exam created. ID: ${exam.id}`);
  }

  async function loadCourseExams(courseId: string) {
    setSelectedCourseId(courseId);
    const exams = await fetchExams({ courseId });
    setCourseExams(exams);
    setStatusMessage(
      exams.length > 0 ? `Loaded ${exams.length} exam(s).` : "No exams in this course yet.",
    );
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
    setTokenBalance(balance.amount);
  }

  async function handleSubmitExam() {
    if (!selectedExam || !walletAddress) {
      return;
    }

    const answers = selectedExam.questions.map((question) => ({
      questionId: question.id,
      selectedOptionIndex: studentAnswers[question.id] ?? -1,
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

  const isRegistered = Boolean(registeredUser);
  const tutorCourses = courses.filter((course) => course.tutorWallet === walletAddress);

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
              </div>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {(isExamsPage || walletAddress || isRegistered) ? (
              <>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--primary-strong)]">
                  Wallet: {walletAddress ? formatWalletAddress(walletAddress) : "Not connected"}
                </span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--primary-strong)]">
                  Role: {registeredUser?.role ?? role}
                </span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--primary-strong)]">
                  Name: {registeredUser?.displayName || displayName || "Not set"}
                </span>
              </>
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
        <section className="">
          {isExamsPage ? (
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">
                  Exams
                </p>
                <p className="mt-1 text-sm text-[#46666c]">
                  Load, unlock, and take exams.
                </p>
              </div>
            </div>
          ) : null}

          {(isExamsPage || walletAddress || isRegistered) ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[1.4rem] bg-[var(--primary)] px-4 py-3 text-white">
                <p className="text-xs uppercase tracking-[0.2em] text-[#cfe8eb]">Wallet</p>
                <p className="mt-2 text-sm font-medium">
                  {walletAddress ? formatWalletAddress(walletAddress) : "Not connected"}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#5a787d]">Role</p>
                <p className="mt-2 text-sm font-medium text-[var(--primary-strong)]">
                  {registeredUser?.role ?? role}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#5a787d]">Name</p>
                <p className="mt-2 text-sm font-medium text-[var(--primary-strong)]">
                  {registeredUser?.displayName || displayName || "Not set"}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#5a787d]">Balance</p>
                <p className="mt-2 text-sm font-medium text-[var(--primary-strong)]">
                  {tokenBalance === null ? "Unavailable" : `${tokenBalance} token(s)`}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#5a787d]">Courses</p>
                <p className="mt-2 text-sm font-medium text-[var(--primary-strong)]">{courses.length}</p>
              </div>
            </div>
          ) : null}

          {statusMessage ? (
            <p className="mt-4 rounded-[1.4rem] bg-[var(--primary-soft)] px-4 py-3 text-sm text-[var(--primary-strong)]">
              {statusMessage}
            </p>
          ) : null}
        </section>

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
              <Surface className="mx-auto w-full max-w-2xl">
                <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">
                  Complete registration
                </h2>
                <div className="mt-5 grid gap-4">
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Display name"
                    className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                  />
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as UserRole)}
                    className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                  >
                    <option value="student">Student</option>
                    <option value="tutor">Tutor</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleRegister()}
                    className="rounded-full bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                  >
                    Register
                  </button>
                </div>
              </Surface>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <Surface>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="inline-flex rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">
                        Courses
                      </span>
                      <h2 className="mt-3 text-2xl font-semibold text-[var(--primary-strong)]">
                        Available courses
                      </h2>
                    </div>
                    {registeredUser?.role === "tutor" ? (
                      <button
                        type="button"
                        onClick={() => setSelectedCourseId("")}
                        className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Tutor View
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4">
                    {coursesLoading ? <p className="text-sm text-[#5a787d]">Loading courses...</p> : null}
                    {!coursesLoading && courses.length === 0 ? (
                      <p className="rounded-[1.4rem] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[#46666c]">
                        No courses yet.
                      </p>
                    ) : null}
                    {courses.map((course: Course) => (
                      <article
                        key={course.id}
                        className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-muted)]/70 p-5"
                      >
                        <p className="text-xs uppercase tracking-[0.22em] text-[#5a787d]">
                          {course.tutorName || formatWalletAddress(course.tutorWallet)}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-[var(--primary-strong)]">
                          {course.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[#46666c]">
                          {course.description}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => void loadCourseExams(course.id)}
                            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                          >
                            Load Exams
                          </button>
                          <Link
                            href="/exams"
                            className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                          >
                            Go to Exams
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                </Surface>

                <div className="grid gap-6">
                  {registeredUser?.role === "tutor" ? (
                    <Surface>
                      <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">
                        Create Course
                      </h2>
                      <div className="mt-5 grid gap-3">
                        <input
                          value={courseForm.title}
                          onChange={(event) =>
                            setCourseForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          placeholder="Course title"
                          className="rounded-2xl border border-[var(--border)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                        />
                        <textarea
                          value={courseForm.description}
                          onChange={(event) =>
                            setCourseForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="Course description"
                          className="min-h-28 rounded-2xl border border-[var(--border)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateCourse()}
                          disabled={courseSubmitting}
                          className="rounded-full bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60"
                        >
                          Create Course
                        </button>
                      </div>
                    </Surface>
                  ) : null}

                  <Surface className="bg-[var(--primary)] text-white">
                    <h2 className="text-2xl font-semibold">Quick Actions</h2>
                    <div className="mt-5 grid gap-3">
                      <Link
                        href="/exams"
                        className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 text-sm font-medium text-white transition hover:bg-white/12"
                      >
                        Open exam workspace
                      </Link>
                      <a
                        href={clientEnv.bagsTokenUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 text-sm font-medium text-white transition hover:bg-white/12"
                      >
                        Buy token on Bags
                      </a>
                      <div className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 text-sm text-[#dcecef]">
                        Selected course: {selectedCourseId || "None"}
                      </div>
                    </div>
                  </Surface>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <Surface className="bg-[var(--primary)] text-white">
              <h2 className="text-2xl font-semibold">Course Exams</h2>
              <p className="mt-2 text-sm leading-6 text-[#d4ecef]">
                Pick a course from the home page or load an exam directly by id.
              </p>
              <div className="mt-5 grid gap-3">
                {courseExams.length > 0 ? (
                  courseExams.map((exam) => (
                    <button
                      key={exam.id}
                      type="button"
                      onClick={() => void loadExam(exam.id)}
                      className="rounded-[1.5rem] border border-white/15 bg-white/8 p-4 text-left transition hover:bg-white/12"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[#b9e2e8]">
                        {exam.tokenPrice} token(s)
                      </p>
                      <p className="mt-2 text-lg font-semibold">{exam.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#d4ecef]">{exam.description}</p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-[1.4rem] bg-white/8 px-4 py-3 text-sm text-[#d4ecef]">
                    No course exams loaded yet.
                  </p>
                )}
              </div>

              {registeredUser?.role === "tutor" ? (
                <div className="mt-6 border-t border-white/12 pt-6">
                  <p className="text-sm font-medium text-[#d4ecef]">
                    Selected course for exam creation: {selectedCourseId || "None"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tutorCourses.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => setSelectedCourseId(course.id)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          selectedCourseId === course.id
                            ? "bg-white text-[var(--primary)]"
                            : "border border-white/20 bg-white/8 text-white"
                        }`}
                      >
                        {course.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Surface>

            <div className="grid gap-6">
              <Surface>
                <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">Exam Workspace</h2>
                <div className="mt-4 grid gap-3">
                  <input
                    value={selectedExam?.id ?? ""}
                    onChange={(event) =>
                      setSelectedExam((current) =>
                        current
                          ? { ...current, id: event.target.value }
                          : ({
                              id: event.target.value,
                              title: "",
                              description: "",
                              courseId: "",
                              tutorWallet: "",
                              tokenPrice: 0,
                              passThresholdPercent: 70,
                              questions: [],
                              createdAt: "",
                              updatedAt: "",
                            } as Exam),
                      )
                    }
                    placeholder="Paste exam id"
                    className="rounded-2xl border border-[var(--border)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => selectedExam?.id && void loadExam(selectedExam.id)}
                    className="rounded-full bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                  >
                    Load Exam
                  </button>
                </div>

                {selectedExam?.title ? (
                  <div className="mt-6 space-y-5">
                    <div className="rounded-[1.5rem] bg-[var(--surface-muted)] p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-[#5a787d]">
                        {selectedExam.tokenPrice} token(s)
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold text-[var(--primary-strong)]">
                        {selectedExam.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#46666c]">
                        {selectedExam.description}
                      </p>
                      <p className="mt-3 text-sm text-[#46666c]">
                        Access: {examUnlocked ? "Unlocked" : "Payment required"}
                      </p>
                      <p className="text-sm text-[#46666c]">
                        Latest score: {latestScore || "No submission yet"}
                      </p>
                    </div>

                    {!examUnlocked ? (
                      <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--primary-soft)] p-5">
                        <p className="text-sm leading-6 text-[var(--primary-strong)]">
                          If your balance is low, buy or swap enough tokens, then unlock the exam.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <a
                            href={clientEnv.bagsTokenUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                          >
                            Buy on Bags
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleSwapForExam()}
                            disabled={isSwapping}
                            className="rounded-full border border-[var(--primary)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:bg-[var(--surface)] disabled:opacity-60"
                          >
                            {isSwapping ? "Swapping..." : "Swap Enough for Exam"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePayAndVerify()}
                            disabled={isPaying || isVerifying || isSwapping}
                            className="rounded-full bg-[var(--primary-strong)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary)] disabled:opacity-60"
                          >
                            Pay and Unlock
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedExam.questions.map((question) => (
                          <div
                            key={question.id}
                            className="rounded-[1.5rem] border border-[var(--border)] p-4"
                          >
                            <p className="font-medium text-[var(--primary-strong)]">
                              {question.prompt}
                            </p>
                            <div className="mt-3 grid gap-2">
                              {question.options.map((option, optionIndex) => (
                                <button
                                  key={`${question.id}-${optionIndex}`}
                                  type="button"
                                  onClick={() =>
                                    setStudentAnswers((current) => ({
                                      ...current,
                                      [question.id]: optionIndex,
                                    }))
                                  }
                                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                                    studentAnswers[question.id] === optionIndex
                                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                      : "border-[var(--border)] text-[#35575d] hover:border-[var(--primary)]"
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => void handleSubmitExam()}
                          className="rounded-full bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                        >
                          Submit Exam
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </Surface>

              {registeredUser?.role === "tutor" ? (
                <Surface>
                  <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">Create Exam</h2>
                  <div className="mt-5 grid gap-3">
                    <input
                      value={examForm.title}
                      onChange={(event) =>
                        setExamForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Exam title"
                      className="rounded-2xl border border-[var(--border)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                    />
                    <textarea
                      value={examForm.description}
                      onChange={(event) =>
                        setExamForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Exam description"
                      className="min-h-24 rounded-2xl border border-[var(--border)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        value={examForm.tokenPrice}
                        onChange={(event) =>
                          setExamForm((current) => ({
                            ...current,
                            tokenPrice: event.target.value,
                          }))
                        }
                        placeholder="Token price"
                        className="rounded-2xl border border-[var(--border)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                      />
                      <input
                        value={examForm.passThresholdPercent}
                        onChange={(event) =>
                          setExamForm((current) => ({
                            ...current,
                            passThresholdPercent: event.target.value,
                          }))
                        }
                        placeholder="Pass threshold %"
                        className="rounded-2xl border border-[var(--border)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                      />
                    </div>

                    {questions.map((question, index) => (
                      <div
                        key={`question-${index}`}
                        className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-muted)]/70 p-4"
                      >
                        <input
                          value={question.prompt}
                          onChange={(event) =>
                            setQuestions((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, prompt: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder={`Question ${index + 1}`}
                          className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                        />
                        <textarea
                          value={question.options}
                          onChange={(event) =>
                            setQuestions((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, options: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="One option per line"
                          className="mt-3 min-h-28 w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                        />
                        <input
                          type="number"
                          min={0}
                          value={question.correctOptionIndex}
                          onChange={(event) =>
                            setQuestions((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      correctOptionIndex: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Correct option index"
                          className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--primary)]"
                        />
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setQuestions((current) => [
                          ...current,
                          {
                            prompt: "",
                            options: "Option A\nOption B",
                            correctOptionIndex: 0,
                          },
                        ])
                      }
                      className="rounded-full border border-[var(--border)] px-5 py-3 font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                    >
                      Add Question
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreateExam()}
                      disabled={examLoading}
                      className="rounded-full bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60"
                    >
                      Create Exam
                    </button>
                  </div>
                </Surface>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
