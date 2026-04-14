"use client";

import { useEffect, useState } from "react";

import { useCourses } from "@/hooks/useCourses";
import { useBagsInsights } from "@/hooks/useBagsInsights";
import { useBagsSwap } from "@/hooks/useBagsSwap";
import { useCreateCourse } from "@/hooks/useCreateCourse";
import { useExams } from "@/hooks/useExams";
import { usePayment } from "@/hooks/usePayment";
import { useVerifyPayment } from "@/hooks/useVerifyPayment";
import { apiFetch } from "@/lib/client-api";
import { getClientEnv } from "@/lib/env";
import type { Course, Exam, PlatformUser, UserRole } from "@/types/platform";
import type { SolanaProvider } from "@/types/wallet";

type QuestionDraft = {
  prompt: string;
  options: string;
  correctOptionIndex: number;
};

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatWalletAddress(walletAddress: string) {
  if (walletAddress.length <= 10) {
    return walletAddress;
  }

  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

function formatUnixDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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

export function PlatformApp() {
  const clientEnv = getClientEnv();
  const { insights, isLoading: insightsLoading, error: insightsError } = useBagsInsights();
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

  const [walletAddress, setWalletAddress] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [displayName, setDisplayName] = useState("");
  const [registeredUser, setRegisteredUser] = useState<PlatformUser | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [courseExams, setCourseExams] = useState<Exam[]>([]);
  const [examUnlocked, setExamUnlocked] = useState(false);
  const [latestScore, setLatestScore] = useState<string>("");
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
      return;
    }

    void fetchBalance(walletAddress)
      .then((balance) => setTokenBalance(balance.amount))
      .catch(() => setTokenBalance(null));
  }, [walletAddress, paymentSignature]);

  async function connectWallet() {
    const provider = getWalletProvider();

    if (!provider) {
      setStatusMessage("Phantom-compatible wallet not found. Install Phantom or open in an injected wallet browser.");
      return;
    }

    const result = await provider.connect();
    setWalletAddress(result.publicKey.toBase58());
    setStatusMessage("Wallet connected.");
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
    setStatusMessage("Profile saved.");
  }

  async function handleCreateCourse() {
    if (!walletAddress) {
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

  async function loadCourseExams(courseId: string) {
    setSelectedCourseId(courseId);
    const exams = await fetchExams({ courseId });
    setCourseExams(exams);
    setStatusMessage(
      exams.length > 0 ? `Loaded ${exams.length} exam(s).` : "No exams in this course yet.",
    );
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
      `Swap confirmed for about ${compactNumberFormatter.format(
        swap.estimatedOutputTokens,
      )} token(s). Refreshing balance...`,
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

  const tutorCourses = courses.filter((course) => course.tutorWallet === walletAddress);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#d9ecef_0%,#f5f5f5_45%,#edf2f2_100%)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="grid gap-6 rounded-[2rem] border border-[var(--border)] bg-white/90 p-8 shadow-[0_30px_100px_rgba(0,84,97,0.12)] backdrop-blur md:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <span className="inline-flex rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">
              Bags + Solana Assessment Stack
            </span>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[var(--primary-strong)] md:text-6xl">
              Token-gated exams for tutors, verifiable scores for students.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[#46666c] md:text-lg">
              Students buy your Bags token externally, pay to unlock exams, and
              get rewarded on high scores. Tutors publish courses and earn token revenue.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-[#46666c]">
              <span className="rounded-full bg-[var(--primary)] px-4 py-2 font-medium text-white">
                Mint: {clientEnv.tokenMint || "Configure NEXT_PUBLIC_BAGS_TOKEN_MINT"}
              </span>
              <a
                href={clientEnv.bagsTokenUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-medium text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
              >
                Buy Token on Bags
              </a>
            </div>
          </div>

          <div className="space-y-4 rounded-[1.75rem] bg-[var(--primary)] p-6 text-white">
            <p className="text-sm uppercase tracking-[0.24em] text-[#b9e2e8]">
              Wallet Session
            </p>
            <p className="text-sm leading-6 text-[#d4ecef]">
              Use a Phantom-compatible wallet. Bags remains the external liquidity
              and token discovery surface.
            </p>
            <button
              type="button"
              onClick={() => void connectWallet()}
              className="w-full rounded-full bg-white px-5 py-3 font-semibold text-[var(--primary)] transition hover:bg-[var(--surface-muted)]"
            >
              {walletAddress ? "Reconnect Wallet" : "Connect Wallet"}
            </button>
            <div className="space-y-2 text-sm text-[#d4ecef]">
              <p>Wallet: {walletAddress || "Not connected"}</p>
              <p>Role: {registeredUser?.role ?? role}</p>
              <p>
                Balance:{" "}
                {tokenBalance === null ? "Unavailable" : `${tokenBalance} token(s)`}
              </p>
              <p>Last signature: {paymentSignature || "None"}</p>
            </div>
            {statusMessage ? (
              <p className="rounded-2xl bg-white/12 px-4 py-3 text-sm text-white">
                {statusMessage}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-6 rounded-[2rem] border border-[var(--border)] bg-white/85 p-6 shadow-[0_20px_60px_rgba(0,84,97,0.08)] lg:grid-cols-[0.78fr_1.22fr]">
          <div className="space-y-4">
            <span className="inline-flex rounded-full bg-[#e9f5f3] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">
              Bags Proof Layer
            </span>
            <h2 className="text-3xl font-semibold text-[var(--primary-strong)]">
              Live Bags SDK data inside the product.
            </h2>
            <p className="max-w-xl text-sm leading-7 text-[#46666c]">
              This section uses the `@bagsfm/bags-sdk` on the server to pull
              creator claim stats, recent fee-share activity, and a live Bags trade
              quote for the exam token.
            </p>

            {insightsLoading ? (
              <p className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[#46666c]">
                Loading Bags token insights...
              </p>
            ) : null}

            {!insightsLoading && insightsError ? (
              <p className="rounded-2xl bg-[#fff0ef] px-4 py-3 text-sm text-[#8b3d32]">
                {insightsError}
              </p>
            ) : null}

            {!insightsLoading && insights && !insights.enabled ? (
              <p className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[#46666c]">
                Add `BAGS_API_KEY` to enable live Bags SDK metrics in this panel.
              </p>
            ) : null}

            {insights?.enabled ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <article className="rounded-[1.5rem] bg-[var(--primary)] p-4 text-white">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#b9e2e8]">
                    Lifetime Fees
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {compactNumberFormatter.format(insights.lifetimeFees)}
                  </p>
                </article>
                <article className="rounded-[1.5rem] bg-[#eff7f6] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#5a787d]">
                    Creator Wallets
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--primary-strong)]">
                    {compactNumberFormatter.format(insights.creatorCount)}
                  </p>
                </article>
                <article className="rounded-[1.5rem] bg-[#f4f7eb] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6d7c43]">
                    Sample Quote
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#31420d]">
                    {insights.quote
                      ? `${compactNumberFormatter.format(
                          insights.quote.estimatedOutputTokens,
                        )} token(s)`
                      : "Unavailable"}
                  </p>
                </article>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-[1.75rem] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-[var(--primary-strong)]">
                  Creator Claim Stats
                </h3>
                <span className="text-xs uppercase tracking-[0.2em] text-[#6b8589]">
                  Bags State API
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {insights?.enabled && insights.creators.length > 0 ? (
                  insights.creators.map((creator) => (
                    <article
                      key={`${creator.wallet}-${creator.username}`}
                      className="rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--primary-strong)]">
                            {creator.username || formatWalletAddress(creator.wallet)}
                          </p>
                          <p className="text-xs uppercase tracking-[0.18em] text-[#6b8589]">
                            {creator.provider || "unknown"} •{" "}
                            {creator.isCreator ? "Primary creator" : "Fee claimer"}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-[#39595f]">
                          Claimed {creator.totalClaimed}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[#5a787d]">
                    Creator claim data will appear here when the Bags API key is configured.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[1.75rem] bg-[var(--primary)] p-5 text-white">
              <h3 className="text-lg font-semibold">Trade + Fee Activity</h3>
              <div className="mt-4 space-y-4">
                <div className="rounded-[1.25rem] bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#b9e2e8]">
                    Bags Trade Quote
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#d4ecef]">
                    {insights?.quote
                      ? `${insights.quote.inputSol} SOL currently estimates ${compactNumberFormatter.format(
                          insights.quote.estimatedOutputTokens,
                        )} token(s) with ${insights.quote.priceImpactPct.toFixed(2)}% price impact.`
                      : "Quote unavailable."}
                  </p>
                  {insights?.quote ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#b9e2e8]">
                      Route: {insights.quote.routeVenues.join(", ") || "Unknown"}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-[1.25rem] bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#b9e2e8]">
                    Recent Claim Events
                  </p>
                  <div className="mt-3 grid gap-3">
                    {insights?.enabled && insights.recentClaims.length > 0 ? (
                      insights.recentClaims.map((claim) => (
                        <div
                          key={claim.signature}
                          className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3 text-sm text-[#d4ecef]"
                        >
                          <p>
                            {claim.isCreator ? "Creator" : "Claimer"}{" "}
                            {formatWalletAddress(claim.wallet)} claimed {claim.amount}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#b9e2e8]">
                            {formatUnixDate(claim.timestamp)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-[#d4ecef]">
                        Recent Bags claim events will appear here.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(0,84,97,0.08)]">
            <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">Profile</h2>
            <div className="grid gap-4">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Display name"
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--primary)]"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className={`rounded-2xl px-4 py-3 font-medium transition ${
                    role === "student"
                      ? "bg-[var(--primary)] text-white"
                      : "border border-[var(--border)] text-[#46666c]"
                  }`}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setRole("tutor")}
                  className={`rounded-2xl px-4 py-3 font-medium transition ${
                    role === "tutor"
                      ? "bg-[var(--primary)] text-white"
                      : "border border-[var(--border)] text-[#46666c]"
                  }`}
                >
                  Tutor
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleRegister()}
                className="rounded-full bg-[var(--primary)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--primary-strong)]"
              >
                Save Profile
              </button>
            </div>
          </div>

          <div className="space-y-6 rounded-[2rem] bg-[var(--primary)] p-6 text-white shadow-[0_20px_60px_rgba(0,84,97,0.16)]">
            <h2 className="text-2xl font-semibold">Student Flow</h2>
            <p className="text-sm leading-6 text-[#d4ecef]">
              Browse courses, open an exam, buy token on Bags if needed, then pay,
              unlock, answer, and submit.
            </p>
            <div className="grid gap-4">
              {coursesLoading ? (
                <p className="text-sm text-[#b9dadd]">Loading courses...</p>
              ) : null}
              {courses.map((course: Course) => (
                <article
                  key={course.id}
                  className="rounded-[1.5rem] border border-white/15 bg-white/8 p-4"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-[#b9e2e8]">
                    {course.tutorName || course.tutorWallet}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">{course.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#d4ecef]">
                    {course.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadCourseExams(course.id)}
                    className="mt-4 rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm font-medium transition hover:border-white hover:bg-white/14"
                  >
                    Browse Exams
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(0,84,97,0.08)]">
            <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">Tutor Control Room</h2>
            <div className="mt-5 grid gap-6">
              <div className="grid gap-3">
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

              <div className="border-t border-[var(--border)] pt-6">
                <p className="text-sm font-medium text-[#5a787d]">
                  Selected course for exam: {selectedCourseId || "None"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tutorCourses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        selectedCourseId === course.id
                          ? "bg-[var(--primary)] text-white"
                          : "border border-[var(--border)] text-[#46666c] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                      }`}
                    >
                      {course.title}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-3">
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
                      className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-950"
                    />
                  </div>

                  {questions.map((question, index) => (
                    <div
                      key={`question-${index}`}
                      className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4"
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
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-[0_20px_60px_rgba(0,84,97,0.08)]">
            <h2 className="text-2xl font-semibold text-[var(--primary-strong)]">Exam Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-[#46666c]">
              Load an exam by ID from your API responses. In production, surface a
              course detail page that lists its exams from MongoDB.
            </p>
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
                      If your token balance is too low, buy more on Bags and return
                      here. Payment goes to the platform treasury, then the backend
                      verifies the signature and pays the tutor share.
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
                        <p className="font-medium text-[var(--primary-strong)]">{question.prompt}</p>
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

            {courseExams.length > 0 ? (
              <div className="mt-6 border-t border-[var(--border)] pt-6">
                <h3 className="text-lg font-semibold text-[var(--primary-strong)]">Course Exams</h3>
                <div className="mt-4 grid gap-3">
                  {courseExams.map((exam) => (
                    <button
                      key={exam.id}
                      type="button"
                      onClick={() => void loadExam(exam.id)}
                      className="rounded-[1.5rem] border border-[var(--border)] p-4 text-left transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]/45"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[#5a787d]">
                        {exam.tokenPrice} token(s)
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[var(--primary-strong)]">
                        {exam.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#46666c]">
                        {exam.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[2rem] bg-[var(--primary)] p-6 text-white shadow-[0_20px_60px_rgba(0,84,97,0.16)]">
          <h2 className="text-2xl font-semibold">What This Repo Now Contains</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/7 p-4">
              <p className="text-sm uppercase tracking-[0.22em] text-[#b9e2e8]">
                APIs
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d4ecef]">
                Register users, create courses, create exams, fetch exams,
                verify payments, submit answers, and read token balances.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/7 p-4">
              <p className="text-sm uppercase tracking-[0.22em] text-[#b9e2e8]">
                Revenue Split
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d4ecef]">
                Student pays full exam fee, backend verifies signature, then routes
                the 70% tutor share from the platform signer wallet.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/7 p-4">
              <p className="text-sm uppercase tracking-[0.22em] text-[#b9e2e8]">
                Rewards
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d4ecef]">
                Reward eligibility is derived from submission score and backed by
                backend-triggered SPL token transfers.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/7 p-4">
              <p className="text-sm uppercase tracking-[0.22em] text-[#b9e2e8]">
                Hooks
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d4ecef]">
                Includes `useCourses`, `useCreateCourse`, `useExams`,
                `usePayment`, and `useVerifyPayment`.
              </p>
            </div>
          </div>
          {tutorCourses.length > 0 ? (
            <p className="mt-4 text-sm text-[#d4ecef]">
              Your tutor wallet currently owns {tutorCourses.length} course(s) in the
              database listing.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
