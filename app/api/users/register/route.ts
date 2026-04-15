import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { serializeUser } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const walletAddress = normalizeWalletAddress(
      new URL(request.url).searchParams.get("walletAddress") ?? "",
    );

    if (!walletAddress) {
      return errorResponse("walletAddress is required.");
    }

    await connectToDatabase();

    const user = await User.findOne({ walletAddress });

    return successResponse({
      user: user ? serializeUser(user) : null,
    });
  } catch (error) {
    return errorResponse("Unable to load user.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const walletAddress = normalizeWalletAddress(body.walletAddress ?? "");
    const role = body.role;
    const displayName = body.displayName?.trim?.() ?? "";

    if (!walletAddress) {
      return errorResponse("walletAddress is required.");
    }

    if (role !== "tutor" && role !== "student") {
      return errorResponse("role must be either tutor or student.");
    }

    await connectToDatabase();

    const user = await User.findOneAndUpdate(
      { walletAddress },
      { walletAddress, role, displayName },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return successResponse({
      user: serializeUser(user),
    });
  } catch (error) {
    return errorResponse("Unable to register user.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
