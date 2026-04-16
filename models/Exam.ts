import { model, models, Schema, type InferSchemaType, Types } from "mongoose";

import { OPTION_KEYS } from "@/lib/exam-questions";

const questionOptionsSchema = new Schema(
  {
    A: {
      type: String,
      required: true,
      trim: true,
    },
    B: {
      type: String,
      required: true,
      trim: true,
    },
    C: {
      type: String,
      required: true,
      trim: true,
    },
    D: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const questionSchema = new Schema(
  {
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: questionOptionsSchema,
      required: true,
    },
    correctOptionKey: {
      type: String,
      required: true,
      enum: OPTION_KEYS,
    },
  },
  {
    _id: true,
  },
);

const examSchema = new Schema(
  {
    courseId: {
      type: Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    tutorWallet: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    tokenPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    passThresholdPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 70,
    },
    questions: {
      type: [questionSchema],
      required: true,
      validate: {
        validator: (questions: unknown[]) => questions.length > 0,
        message: "An exam must have at least one question.",
      },
    },
  },
  {
    timestamps: true,
  },
);

export type ExamDocument = InferSchemaType<typeof examSchema>;

const Exam = models.Exam || model("Exam", examSchema);

export default Exam;
