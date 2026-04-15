import { Types } from "mongoose";

import Course from "@/models/Course";
import CourseEnrollment from "@/models/CourseEnrollment";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const studentWallet = normalizeWalletAddress(
      new URL(request.url).searchParams.get("studentWallet") ?? "",
    );

    if (!studentWallet) {
      return errorResponse("studentWallet is required.");
    }

    await connectToDatabase();

    const enrollments = await CourseEnrollment.find({ studentWallet }).select("courseId");

    return successResponse({
      courseIds: enrollments.map((enrollment) => enrollment.courseId.toString()),
    });
  } catch (error) {
    return errorResponse("Unable to fetch enrollments.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const studentWallet = normalizeWalletAddress(body.studentWallet ?? "");
    const courseId = body.courseId ?? "";

    if (!studentWallet || !courseId) {
      return errorResponse("studentWallet and courseId are required.");
    }

    if (!Types.ObjectId.isValid(courseId)) {
      return errorResponse("courseId is invalid.");
    }

    await connectToDatabase();

    const student = await User.findOne({ walletAddress: studentWallet, role: "student" });

    if (!student) {
      return errorResponse("Only registered students can enroll in courses.", 403);
    }

    const course = await Course.findById(courseId);

    if (!course) {
      return errorResponse("Course not found.", 404);
    }

    await CourseEnrollment.findOneAndUpdate(
      { courseId, studentWallet },
      { courseId, studentWallet },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return successResponse({ courseId }, { status: 201 });
  } catch (error) {
    return errorResponse("Unable to enroll in course.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
