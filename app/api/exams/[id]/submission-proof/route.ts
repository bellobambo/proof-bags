import { Types } from "mongoose";

import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { connectToDatabase } from "@/lib/db";
import { serializeSubmission } from "@/lib/serializers";
import Submission from "@/models/Submission";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const submissionId = body.submissionId?.trim?.() ?? "";
    const studentWallet = normalizeWalletAddress(body.studentWallet ?? "");
    const scoreProofMemo = body.scoreProofMemo?.trim?.() ?? "";
    const scoreProofSignature = body.scoreProofSignature?.trim?.() ?? "";

    if (!Types.ObjectId.isValid(id)) {
      return errorResponse("Exam id is invalid.");
    }

    if (!Types.ObjectId.isValid(submissionId)) {
      return errorResponse("Submission id is invalid.");
    }

    if (!studentWallet || !scoreProofMemo || !scoreProofSignature) {
      return errorResponse("studentWallet, scoreProofMemo, and scoreProofSignature are required.");
    }

    await connectToDatabase();

    const submission = await Submission.findOne({
      _id: submissionId,
      examId: id,
      studentWallet,
    });

    if (!submission) {
      return errorResponse("Submission not found.", 404);
    }

    if (submission.scoreProofMemo && submission.scoreProofMemo !== scoreProofMemo) {
      return errorResponse("Submission memo does not match the saved exam score.", 409);
    }

    submission.scoreProofMemo = scoreProofMemo;
    submission.scoreProofSignature = scoreProofSignature;
    await submission.save();

    return successResponse({
      submission: serializeSubmission(submission),
    });
  } catch (error) {
    return errorResponse("Unable to save submission proof.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
