import { Types } from "mongoose";

import Course from "@/models/Course";
import Exam from "@/models/Exam";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
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
    const questions = Array.isArray(body.questions) ? body.questions : [];

    if (!tutorWallet || !courseId || !title || !description || questions.length === 0) {
      return errorResponse(
        "tutorWallet, courseId, title, description, and questions are required.",
      );
    }

    if (!Types.ObjectId.isValid(courseId)) {
      return errorResponse("courseId is invalid.");
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
