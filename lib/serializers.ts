import type { HydratedDocument } from "mongoose";

import type { CourseDocument } from "@/models/Course";
import type { ExamDocument } from "@/models/Exam";
import type { PaymentDocument } from "@/models/Payment";
import type { SubmissionDocument } from "@/models/Submission";
import type { UserDocument } from "@/models/User";

export function serializeUser(user: HydratedDocument<UserDocument>) {
  return {
    id: user._id.toString(),
    walletAddress: user.walletAddress,
    role: user.role,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function serializeCourse(course: HydratedDocument<CourseDocument>) {
  return {
    id: course._id.toString(),
    title: course.title,
    description: course.description,
    tutorWallet: course.tutorWallet,
    tutorName: course.tutorName,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

export function serializeExam(
  exam: HydratedDocument<ExamDocument>,
  options?: { includeAnswers?: boolean },
) {
  return {
    id: exam._id.toString(),
    title: exam.title,
    description: exam.description,
    courseId: exam.courseId.toString(),
    tutorWallet: exam.tutorWallet,
    tokenPrice: exam.tokenPrice,
    passThresholdPercent: exam.passThresholdPercent,
    questions: exam.questions.map((question) => ({
      id: question._id?.toString() ?? question.prompt,
      prompt: question.prompt,
      options: question.options,
      correctOptionIndex: options?.includeAnswers
        ? question.correctOptionIndex
        : undefined,
    })),
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
}

export function serializePayment(payment: HydratedDocument<PaymentDocument>) {
  return {
    id: payment._id.toString(),
    examId: payment.examId.toString(),
    studentWallet: payment.studentWallet,
    tutorWallet: payment.tutorWallet,
    transactionSignature: payment.transactionSignature,
    amountTokens: payment.amountTokens,
    tutorShareTokens: payment.tutorShareTokens,
    platformShareTokens: payment.platformShareTokens,
    rewardTokens: payment.rewardTokens,
    status: payment.status,
    verifiedAt: payment.verifiedAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export function serializeSubmission(
  submission: HydratedDocument<SubmissionDocument>,
) {
  return {
    id: submission._id.toString(),
    examId: submission.examId.toString(),
    studentWallet: submission.studentWallet,
    scorePercent: submission.scorePercent,
    totalQuestions: submission.totalQuestions,
    correctAnswers: submission.correctAnswers,
    rewardTokens: submission.rewardTokens,
    answers: submission.answers,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}
