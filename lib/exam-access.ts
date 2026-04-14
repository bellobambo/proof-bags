import { Types } from "mongoose";

import Payment from "@/models/Payment";

export async function hasExamAccess(params: {
  examId: string | Types.ObjectId;
  walletAddress?: string;
}) {
  if (!params.walletAddress) {
    return false;
  }

  const payment = await Payment.findOne({
    examId: params.examId,
    studentWallet: params.walletAddress,
    status: "verified",
  }).lean();

  return Boolean(payment);
}
