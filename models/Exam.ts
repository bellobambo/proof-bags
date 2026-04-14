import { model, models, Schema, type InferSchemaType, Types } from "mongoose";

const questionSchema = new Schema(
  {
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      validate: {
        validator: (options: string[]) => options.length >= 2,
        message: "Each question must have at least two options.",
      },
      required: true,
    },
    correctOptionIndex: {
      type: Number,
      required: true,
      min: 0,
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
