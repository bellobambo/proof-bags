import { model, models, Schema, type InferSchemaType, Types } from "mongoose";

const answerSchema = new Schema(
  {
    questionId: {
      type: String,
      required: true,
    },
    selectedOptionIndex: {
      type: Number,
      required: true,
      min: 0,
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
  },
  {
    timestamps: true,
  },
);

export type SubmissionDocument = InferSchemaType<typeof submissionSchema>;

const Submission = models.Submission || model("Submission", submissionSchema);

export default Submission;
