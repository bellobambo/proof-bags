import { model, models, Schema, type InferSchemaType, Types } from "mongoose";

import { OPTION_KEYS } from "@/lib/exam-questions";

const answerSchema = new Schema(
  {
    questionId: {
      type: String,
      required: true,
    },
    selectedOptionKey: {
      type: String,
      required: true,
      enum: OPTION_KEYS,
    },
  },
  {
    _id: false,
  },
);

const submissionSchema = new Schema(
  {
    examId: {
      type: Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    studentWallet: {
      type: String,
      required: true,
      index: true,
    },
    answers: {
      type: [answerSchema],
      required: true,
    },
    scorePercent: {
      type: Number,
      required: true,
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    correctAnswers: {
      type: Number,
      required: true,
    },
    rewardTokens: {
      type: Number,
      default: 0,
    },
    scoreProofMemo: {
      type: String,
      default: "",
    },
    scoreProofSignature: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

export type SubmissionDocument = InferSchemaType<typeof submissionSchema>;

const Submission = models.Submission || model("Submission", submissionSchema);

export default Submission;
