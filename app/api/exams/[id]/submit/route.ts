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
import { buildExamSubmissionMemo, payoutTokens } from "@/lib/solana";

async function dropLegacySubmissionIndex() {
  try {
    await Submission.collection.dropIndex("attestationTransactionSignature_1");
  } catch (error) {
    const indexMissing =
      error instanceof Error
      && "code" in error
      && (error as Error & { code?: number }).code === 27;

    if (!indexMissing) {
      console.warn("[exam-submit] unable to drop legacy submission index", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

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
    await dropLegacySubmissionIndex();

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

    const existingSubmission = await Submission.findOne({
      examId: exam._id,
      studentWallet,
    }).lean();

    if (existingSubmission) {
      return errorResponse("You can only submit this exam once.", 409);
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

    const scoreProofMemo = buildExamSubmissionMemo({
      examTitle: exam.title,
      scorePercent,
    });
    submission.scoreProofMemo = scoreProofMemo;
    await submission.save();

    let studentRewardSignature = "";
    let rewardTransactionError = "";

    if (rewardTokens > 0) {
      try {
        studentRewardSignature =
          (await payoutTokens({
          recipientWallet: studentWallet,
          amountTokens: rewardTokens,
        })) ?? "";
      } catch (error) {
        rewardTransactionError =
          error instanceof Error ? error.message : "Unable to send reward transaction.";
        console.error("[exam-submit] failed to send reward transaction", {
          examId: exam._id.toString(),
          studentWallet,
          rewardTokens,
          scorePercent,
          error: rewardTransactionError,
        });
      }
    }

    verifiedPayment.rewardTokens = rewardTokens;
    verifiedPayment.studentRewardSignature = studentRewardSignature;

    if (rewardTokens > 0 && studentRewardSignature) {
      verifiedPayment.status = "rewarded";
    }

    await verifiedPayment.save();

    return successResponse({
      submission: serializeSubmission(submission),
      reward: {
        eligible: rewardEligible,
        amountTokens: rewardTokens,
        transactionSignature: studentRewardSignature || null,
        memo: scoreProofMemo,
        error: rewardTransactionError || null,
      },
    });
  } catch (error) {
    return errorResponse("Unable to submit exam.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
