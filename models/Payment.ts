import { model, models, Schema, type InferSchemaType, Types } from "mongoose";

const paymentSchema = new Schema(
  {
    examId: {
      type: Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    courseId: {
      type: Types.ObjectId,
      ref: "Course",
      required: true,
    },
    studentWallet: {
      type: String,
      required: true,
      index: true,
    },
    tutorWallet: {
      type: String,
      required: true,
    },
    transactionSignature: {
      type: String,
      required: true,
      unique: true,
    },
    amountTokens: {
      type: Number,
      required: true,
    },
    tutorShareTokens: {
      type: Number,
      required: true,
    },
    platformShareTokens: {
      type: Number,
      required: true,
    },
    rewardTokens: {
      type: Number,
      default: 0,
    },
    tutorPayoutSignature: {
      type: String,
      default: "",
    },
    studentRewardSignature: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["verified", "rewarded"],
      default: "verified",
    },
    verifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

export type PaymentDocument = InferSchemaType<typeof paymentSchema>;

const Payment = models.Payment || model("Payment", paymentSchema);

export default Payment;
