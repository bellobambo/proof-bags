import { Types } from "mongoose";

import Course from "@/models/Course";
import Exam from "@/models/Exam";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { validateExamQuestionInput } from "@/lib/exam-questions";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { serializeExam } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tutorWallet = normalizeWalletAddress(body.tutorWallet ?? "");
    const courseId = body.courseId ?? "";
    const title = body.title?.trim?.() ?? "";
    const description = body.description?.trim?.() ?? "";
    const tokenPrice = Number(body.tokenPrice ?? 0);
    const passThresholdPercent = Number(body.passThresholdPercent ?? 70);
    const rawQuestions = Array.isArray(body.questions) ? body.questions : [];

    if (!tutorWallet || !courseId || !title || !description || rawQuestions.length === 0) {
      return errorResponse(
        "tutorWallet, courseId, title, description, and questions are required.",
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

    const tutor = await User.findOne({ walletAddress: tutorWallet, role: "tutor" });

    if (!tutor) {
      return errorResponse("Only registered tutors can create exams.", 403);
    }

    const course = await Course.findOne({ _id: courseId, tutorWallet });

    if (!course) {
      return errorResponse("Course not found for this tutor.", 404);
    }

    const exam = await Exam.create({
      courseId,
      tutorWallet,
      title,
      description,
      tokenPrice,
      passThresholdPercent,
      questions,
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
