import { model, models, Schema, type InferSchemaType, Types } from "mongoose";

const examCreationFeeSchema = new Schema(
  {
    courseId: {
      type: Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    examId: {
      type: Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    tutorWallet: {
      type: String,
      required: true,
      index: true,
    },
    transactionSignature: {
      type: String,
      required: true,
      unique: true,
    },
    amountTokens: {
      type: Number,
      required: true,
      min: 0,
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

export type ExamCreationFeeDocument = InferSchemaType<typeof examCreationFeeSchema>;

const ExamCreationFee = models.ExamCreationFee || model("ExamCreationFee", examCreationFeeSchema);

export default ExamCreationFee;
