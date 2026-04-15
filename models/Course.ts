import { model, Schema, type InferSchemaType } from "mongoose";

const courseSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    tutorWallet: {
      type: String,
      required: true,
      index: true,
    },
    tutorName: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

export type CourseDocument = InferSchemaType<typeof courseSchema>;

const Course = model("Course", courseSchema, undefined, { overwriteModels: true });

export default Course;
