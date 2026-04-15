import Course from "@/models/Course";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { serializeCourse } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tutorWallet = normalizeWalletAddress(body.tutorWallet ?? "");
    const title = body.title?.trim?.() ?? "";
    const description = body.description?.trim?.() ?? "";

    if (!tutorWallet || !title) {
      return errorResponse("tutorWallet and title are required.");
    }

    await connectToDatabase();

    const tutor = await User.findOne({ walletAddress: tutorWallet, role: "tutor" });

    if (!tutor) {
      return errorResponse("Only registered tutors can create courses.", 403);
    }

    const course = await Course.create({
      tutorWallet,
      tutorName: tutor.displayName,
      title,
      description,
    });

    return successResponse(
      {
        course: serializeCourse(course),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse("Unable to create course.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
