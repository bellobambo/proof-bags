import { Types } from "mongoose";

import Exam from "@/models/Exam";
import Submission from "@/models/Submission";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { hasExamAccess } from "@/lib/exam-access";
import { serializeExam, serializeSubmission } from "@/lib/serializers";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const walletAddress =
      new URL(request.url).searchParams.get("walletAddress") ?? undefined;

    if (!Types.ObjectId.isValid(id)) {
      return errorResponse("Exam id is invalid.");
    }

    await connectToDatabase();

    const exam = await Exam.findById(id);

    if (!exam) {
      return errorResponse("Exam not found.", 404);
    }

    const canViewAnswers = walletAddress === exam.tutorWallet;
    const unlocked = canViewAnswers
      ? true
      : await hasExamAccess({ examId: exam._id, walletAddress });

    const latestSubmission = walletAddress
      ? await Submission.findOne({
          examId: exam._id,
          studentWallet: walletAddress,
        }).sort({ createdAt: -1 })
      : null;

    return successResponse({
      exam: serializeExam(exam, { includeAnswers: canViewAnswers }),
      unlocked,
      latestSubmission: latestSubmission
        ? serializeSubmission(latestSubmission)
        : null,
    });
  } catch (error) {
    return errorResponse("Unable to fetch exam.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
