import { Types } from "mongoose";

import Course from "@/models/Course";
import Exam from "@/models/Exam";
import ExamCreationFee from "@/models/ExamCreationFee";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { validateExamQuestionInput } from "@/lib/exam-questions";
import { getServerEnv } from "@/lib/env";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { serializeExam } from "@/lib/serializers";
import { getPlatformTreasuryTokenAccount, validateTokenMintDecimals, verifyTokenTransfer } from "@/lib/solana";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tutorWallet = normalizeWalletAddress(body.tutorWallet ?? "");
    const courseId = body.courseId ?? "";
    const title = body.title?.trim?.() ?? "";
    const description = body.description?.trim?.() ?? "";
    const creationFeeSignature = body.creationFeeSignature?.trim?.() ?? "";
    const tokenPrice = Number(body.tokenPrice ?? 0);
    const passThresholdPercent = Number(body.passThresholdPercent ?? 70);
    const rawQuestions = Array.isArray(body.questions) ? body.questions : [];

    if (
      !tutorWallet
      || !courseId
      || !title
      || !description
      || !creationFeeSignature
      || rawQuestions.length === 0
    ) {
      return errorResponse(
        "tutorWallet, courseId, title, description, creationFeeSignature, and questions are required.",
      );
    }

    if (!Types.ObjectId.isValid(courseId)) {
      return errorResponse("courseId is invalid.");
    }

    let questions;

    try {
      questions = rawQuestions.map((question: unknown) => {
        const questionRecord =
          question && typeof question === "object"
            ? (question as {
                prompt?: unknown;
                options?: {
                  A?: unknown;
                  B?: unknown;
                  C?: unknown;
                  D?: unknown;
                };
                correctOptionKey?: unknown;
              })
            : {};

        return validateExamQuestionInput({
          prompt: typeof questionRecord.prompt === "string" ? questionRecord.prompt : "",
          options: {
            A: typeof questionRecord.options?.A === "string" ? questionRecord.options.A : "",
            B: typeof questionRecord.options?.B === "string" ? questionRecord.options.B : "",
            C: typeof questionRecord.options?.C === "string" ? questionRecord.options.C : "",
            D: typeof questionRecord.options?.D === "string" ? questionRecord.options.D : "",
          },
          correctOptionKey: questionRecord.correctOptionKey as "A" | "B" | "C" | "D",
        });
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Questions are invalid.",
      );
    }

    await connectToDatabase();
    await validateTokenMintDecimals();

    const tutor = await User.findOne({ walletAddress: tutorWallet, role: "tutor" });

    if (!tutor) {
      return errorResponse("Only registered tutors can create exams.", 403);
    }

    const course = await Course.findOne({ _id: courseId, tutorWallet });

    if (!course) {
      return errorResponse("Course not found for this tutor.", 404);
    }

    const existingFee = await ExamCreationFee.findOne({
      transactionSignature: creationFeeSignature,
    });

    if (existingFee) {
      return errorResponse("This exam creation fee transaction has already been used.", 409);
    }

    await verifyTokenTransfer({
      signature: creationFeeSignature,
      authorityWallet: tutorWallet,
      recipientTokenAccount: getPlatformTreasuryTokenAccount().toBase58(),
      amountTokens: getServerEnv().examCreationFeeTokens,
    });

    const exam = await Exam.create({
      courseId,
      tutorWallet,
      title,
      description,
      tokenPrice,
      passThresholdPercent,
      questions,
    });

    await ExamCreationFee.create({
      courseId,
      examId: exam._id,
      tutorWallet,
      transactionSignature: creationFeeSignature,
      amountTokens: getServerEnv().examCreationFeeTokens,
    });

    return successResponse(
      {
        exam: serializeExam(exam),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse("Unable to create exam.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
