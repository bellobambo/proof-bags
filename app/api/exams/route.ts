import { Types } from "mongoose";

import Exam from "@/models/Exam";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { serializeExam } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId");
    const tutorWallet = url.searchParams.get("tutorWallet");
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

    return successResponse({
      exams: exams.map((exam) => serializeExam(exam)),
    });
  } catch (error) {
    return errorResponse("Unable to fetch exams.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
