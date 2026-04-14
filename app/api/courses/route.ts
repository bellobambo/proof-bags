import Course from "@/models/Course";
import { connectToDatabase } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api";
import { serializeCourse } from "@/lib/serializers";

export async function GET() {
  try {
    await connectToDatabase();

    const courses = await Course.find().sort({ createdAt: -1 });

    return successResponse({
      courses: courses.map(serializeCourse),
    });
  } catch (error) {
    return errorResponse("Unable to fetch courses.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
