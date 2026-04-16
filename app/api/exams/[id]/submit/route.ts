import { Types } from "mongoose";

import Exam from "@/models/Exam";
import type { ExamDocument } from "@/models/Exam";
import Payment from "@/models/Payment";
import Submission from "@/models/Submission";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { normalizeStoredExamQuestion, OPTION_KEYS } from "@/lib/exam-questions";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { getServerEnv } from "@/lib/env";
import { serializeSubmission } from "@/lib/serializers";
import { payoutTokens } from "@/lib/solana";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const studentWallet = normalizeWalletAddress(body.studentWallet ?? "");
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!Types.ObjectId.isValid(id)) {
      return errorResponse("Exam id is invalid.");
    }

    if (!studentWallet || answers.length === 0) {
      return errorResponse("studentWallet and answers are required.");
    }

    await connectToDatabase();

    const exam = await Exam.findById(id);

    if (!exam) {
      return errorResponse("Exam not found.", 404);
    }

    const user = await User.findOne({ walletAddress: studentWallet });

    if (!user) {
      return errorResponse("Registered user not found.", 403);
    }

    if (user.role !== "student") {
      return errorResponse("Only students can submit exams.", 403);
    }

    const verifiedPayment = await Payment.findOne({
      examId: exam._id,
      studentWallet,
      status: { $in: ["verified", "rewarded"] },
    });

    if (!verifiedPayment) {
      return errorResponse("Payment verification is required before submission.", 403);
    }

    const hasInvalidAnswer = answers.some(
      (answer: { selectedOptionKey: string }) =>
        typeof answer.selectedOptionKey !== "string"
        || !OPTION_KEYS.includes(answer.selectedOptionKey as (typeof OPTION_KEYS)[number]),
    );

    if (hasInvalidAnswer) {
      return errorResponse("Each answer must use option A, B, C, or D.");
    }

    if (answers.length !== exam.questions.length) {
      return errorResponse("A submission must answer every question.");
    }

    const answerMap = new Map<string, string>(
      answers.map((answer: { questionId: string; selectedOptionKey: string }) => [
        String(answer.questionId),
        String(answer.selectedOptionKey),
      ]),
    );

    const correctAnswers = exam.questions.reduce(
      (score: number, question: ExamDocument["questions"][number]) => {
        const normalizedQuestion = normalizeStoredExamQuestion(question);
        const selectedOptionKey = answerMap.get(question._id.toString());
        return score + Number(selectedOptionKey === normalizedQuestion.correctOptionKey);
      },
      0,
    );

    const totalQuestions = exam.questions.length;
    const scorePercent = Math.round((correctAnswers / totalQuestions) * 100);
    const rewardEligible = scorePercent >= getServerEnv().rewardThresholdPercent;
    const rewardTokens = rewardEligible ? getServerEnv().rewardAmountTokens : 0;

    const submission = await Submission.create({
      examId: exam._id,
      studentWallet,
      answers,
      scorePercent,
      totalQuestions,
      correctAnswers,
      rewardTokens,
    });

    let studentRewardSignature = "";

    if (rewardTokens > 0) {
      studentRewardSignature =
        (await payoutTokens({
          recipientWallet: studentWallet,
          amountTokens: rewardTokens,
        })) ?? "";
    }

    if (rewardTokens > 0) {
      verifiedPayment.rewardTokens = rewardTokens;
      verifiedPayment.studentRewardSignature = studentRewardSignature;
      verifiedPayment.status = "rewarded";
      await verifiedPayment.save();
    }

    return successResponse({
      submission: serializeSubmission(submission),
      reward: {
        eligible: rewardEligible,
        amountTokens: rewardTokens,
        transactionSignature: studentRewardSignature || null,
      },
    });
  } catch (error) {
    return errorResponse("Unable to submit exam.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
