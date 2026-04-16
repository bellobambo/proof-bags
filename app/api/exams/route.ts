import { Types } from "mongoose";

import Exam from "@/models/Exam";
import Submission from "@/models/Submission";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { serializeExam, serializeSubmission } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId");
    const tutorWallet = url.searchParams.get("tutorWallet");
    const walletAddress = normalizeWalletAddress(url.searchParams.get("walletAddress") ?? "");
    const query: Record<string, unknown> = {};

    if (courseId) {
      if (!Types.ObjectId.isValid(courseId)) {
        return errorResponse("courseId is invalid.");
      }

      query.courseId = courseId;
    }

    if (tutorWallet) {
      query.tutorWallet = tutorWallet;
    }

    await connectToDatabase();

    const exams = await Exam.find(query).sort({ createdAt: -1 });
    let latestSubmissionByExamId = new Map<string, ReturnType<typeof serializeSubmission>>();

    if (walletAddress && exams.length > 0) {
      const submissions = await Submission.find({
        examId: { $in: exams.map((exam) => exam._id) },
        studentWallet: walletAddress,
      }).sort({ createdAt: -1 });

      latestSubmissionByExamId = submissions.reduce((result, submission) => {
        const examIdKey = submission.examId.toString();

        if (!result.has(examIdKey)) {
          result.set(examIdKey, serializeSubmission(submission));
        }

        return result;
      }, new Map<string, ReturnType<typeof serializeSubmission>>());
    }

    return successResponse({
      exams: exams.map((exam) => ({
        ...serializeExam(exam),
        latestSubmission: latestSubmissionByExamId.get(exam._id.toString()) ?? null,
      })),
    });
  } catch (error) {
    return errorResponse("Unable to fetch exams.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
