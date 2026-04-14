import { Types } from "mongoose";

import Exam from "@/models/Exam";
import Payment from "@/models/Payment";
import Submission from "@/models/Submission";
import { connectToDatabase } from "@/lib/db";
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

    const verifiedPayment = await Payment.findOne({
      examId: exam._id,
      studentWallet,
      status: { $in: ["verified", "rewarded"] },
    });

    if (!verifiedPayment) {
      return errorResponse("Payment verification is required before submission.", 403);
    }

    const answerMap = new Map<string, number>(
      answers.map((answer: { questionId: string; selectedOptionIndex: number }) => [
        String(answer.questionId),
        Number(answer.selectedOptionIndex),
      ]),
    );

    const correctAnswers = exam.questions.reduce(
      (
        score: number,
        question: { _id: { toString: () => string }; correctOptionIndex: number },
      ) => {
        const selectedOptionIndex = answerMap.get(question._id.toString());
        return score + Number(selectedOptionIndex === question.correctOptionIndex);
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
