import Exam from "@/models/Exam";
import Payment from "@/models/Payment";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, normalizeWalletAddress, successResponse } from "@/lib/api";
import { serializePayment } from "@/lib/serializers";
import {
  getTokenAccountForOwner,
  getPlatformTreasuryTokenAccount,
  validateTokenMintDecimals,
  verifyStudentPayment,
} from "@/lib/solana";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const examId = body.examId ?? "";
    const studentWallet = normalizeWalletAddress(body.studentWallet ?? "");
    const signature = body.signature?.trim?.() ?? "";

    if (!examId || !studentWallet || !signature) {
      return errorResponse("examId, studentWallet, and signature are required.");
    }

    await connectToDatabase();
    await validateTokenMintDecimals();

    const exam = await Exam.findById(examId);

    if (!exam) {
      return errorResponse("Exam not found.", 404);
    }

    const user = await User.findOne({ walletAddress: studentWallet });

    if (!user) {
      return errorResponse("Registered user not found.", 403);
    }

    if (user.role !== "student") {
      return errorResponse("Only students can unlock exams.", 403);
    }

    const existingPayment = await Payment.findOne({ transactionSignature: signature });

    if (existingPayment) {
      return successResponse({
        payment: serializePayment(existingPayment),
        alreadyVerified: true,
      });
    }

    await verifyStudentPayment({
      signature,
      studentWallet,
      expectedTransfers: [
        {
          recipientTokenAccount: getTokenAccountForOwner(exam.tutorWallet).toBase58(),
          amountTokens: Number((exam.tokenPrice * 0.7).toFixed(9)),
        },
        {
          recipientTokenAccount: getPlatformTreasuryTokenAccount().toBase58(),
          amountTokens: Number((exam.tokenPrice * 0.3).toFixed(9)),
        },
      ],
    });

    const tutorShareTokens = Number((exam.tokenPrice * 0.7).toFixed(9));
    const platformShareTokens = Number((exam.tokenPrice - tutorShareTokens).toFixed(9));

    const payment = await Payment.create({
      examId: exam._id,
      courseId: exam.courseId,
      studentWallet,
      tutorWallet: exam.tutorWallet,
      transactionSignature: signature,
      amountTokens: exam.tokenPrice,
      tutorShareTokens,
      platformShareTokens,
      status: "verified",
    });

    return successResponse({
      payment: serializePayment(payment),
      examUnlocked: true,
    });
  } catch (error) {
    return errorResponse("Unable to verify payment.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
