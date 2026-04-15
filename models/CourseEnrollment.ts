import { model, models, Schema, type InferSchemaType, Types } from "mongoose";

const courseEnrollmentSchema = new Schema(
  {
    courseId: {
      type: Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    studentWallet: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

courseEnrollmentSchema.index({ courseId: 1, studentWallet: 1 }, { unique: true });

export type CourseEnrollmentDocument = InferSchemaType<typeof courseEnrollmentSchema>;

const CourseEnrollment =
  models.CourseEnrollment || model("CourseEnrollment", courseEnrollmentSchema);

export default CourseEnrollment;
