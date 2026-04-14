import { model, models, Schema, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["tutor", "student"],
      required: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

const User = models.User || model("User", userSchema);

export default User;
