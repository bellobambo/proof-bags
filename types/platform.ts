import type { OptionKey, QuestionOptions } from "@/lib/exam-questions";

export type UserRole = "tutor" | "student";

export type PlatformUser = {
  id: string;
  walletAddress: string;
  role: UserRole;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  tutorWallet: string;
  tutorName: string;
  createdAt: string;
  updatedAt: string;
};

export type ExamQuestion = {
  id: string;
  prompt: string;
  options: QuestionOptions;
  correctOptionKey?: OptionKey;
};

export type Exam = {
  id: string;
  title: string;
  description: string;
  courseId: string;
  tutorWallet: string;
  tokenPrice: number;
  passThresholdPercent: number;
  questions: ExamQuestion[];
  createdAt: string;
  updatedAt: string;
  latestSubmission?: Submission | null;
};

export type Submission = {
  id: string;
  examId: string;
  studentWallet: string;
  scorePercent: number;
  totalQuestions: number;
  correctAnswers: number;
  rewardTokens: number;
  scoreProofMemo: string;
  scoreProofSignature: string;
  answers: Array<{
    questionId: string;
    selectedOptionKey: OptionKey;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  id: string;
  examId: string;
  studentWallet: string;
  tutorWallet: string;
  transactionSignature: string;
  amountTokens: number;
  tutorShareTokens: number;
  platformShareTokens: number;
  rewardTokens: number;
  status: "verified" | "rewarded";
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error?: string;
  details?: Record<string, unknown>;
};

export type BagsTokenCreatorInsight = {
  username: string;
  wallet: string;
  provider: string | null;
  avatarUrl: string;
  totalClaimed: string;
  isCreator: boolean;
};

export type BagsTokenClaimEventInsight = {
  wallet: string;
  amount: string;
  signature: string;
  timestamp: number;
  isCreator: boolean;
};

export type BagsTradeQuoteInsight = {
  inputSol: number;
  estimatedOutputTokens: number;
  minimumOutputTokens: number;
  priceImpactPct: number;
  routeVenues: string[];
};

export type BagsSwapForExamResponse = {
  examId: string;
  examPriceTokens: number;
  inputAmountLamports: number;
  inputAmountSol: number;
  estimatedOutputTokens: number;
  minimumOutputTokens: number;
  priceImpactPct: number;
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  requestId: string;
  routeVenues: string[];
};

export type BagsTokenDetailEntry = {
  label: string;
  value: string;
};

export type BagsTokenDetails = {
  entries: BagsTokenDetailEntry[];
  raw: Record<string, unknown> | null;
  pfpUrl: string;
};

export type BagsTokenInsights = {
  enabled: boolean;
  tokenMint: string;
  lifetimeFees: number;
  creatorCount: number;
  creators: BagsTokenCreatorInsight[];
  recentClaims: BagsTokenClaimEventInsight[];
  quote: BagsTradeQuoteInsight | null;
};
