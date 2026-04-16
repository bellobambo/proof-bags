export const OPTION_KEYS = ["A", "B", "C", "D"] as const;

export type OptionKey = (typeof OPTION_KEYS)[number];

export type QuestionOptions = Record<OptionKey, string>;

export type ExamQuestionInput = {
  prompt: string;
  options: QuestionOptions;
  correctOptionKey: OptionKey;
};

export function createEmptyQuestionInput(): ExamQuestionInput {
  return {
    prompt: "",
    options: {
      A: "",
      B: "",
      C: "",
      D: "",
    },
    correctOptionKey: "A",
  };
}

export function normalizeExamQuestionInput(question: ExamQuestionInput): ExamQuestionInput {
  const prompt = question.prompt.trim();
  const options = OPTION_KEYS.reduce(
    (result, optionKey) => ({
      ...result,
      [optionKey]: question.options[optionKey].trim(),
    }),
    {} as QuestionOptions,
  );

  return {
    prompt,
    options,
    correctOptionKey: question.correctOptionKey,
  };
}

export function normalizeStoredExamQuestion(question: {
  prompt?: unknown;
  options?: unknown;
  correctOptionKey?: unknown;
  correctOptionIndex?: unknown;
}) {
  const options = normalizeStoredQuestionOptions(question.options);
  const correctOptionKey = normalizeStoredCorrectOptionKey({
    options,
    correctOptionKey: question.correctOptionKey,
    correctOptionIndex: question.correctOptionIndex,
  });

  return validateExamQuestionInput({
    prompt: typeof question.prompt === "string" ? question.prompt : "",
    options,
    correctOptionKey,
  });
}

export function validateExamQuestionInput(question: ExamQuestionInput) {
  const normalized = normalizeExamQuestionInput(question);

  if (!normalized.prompt) {
    throw new Error("Each question must include a prompt.");
  }

  for (const optionKey of OPTION_KEYS) {
    if (!normalized.options[optionKey]) {
      throw new Error(`Each question must include option ${optionKey}.`);
    }
  }

  if (!OPTION_KEYS.includes(normalized.correctOptionKey)) {
    throw new Error("Each question must include a valid correct answer.");
  }

  return normalized;
}

export function parseTemplateQuestions(template: string) {
  const blocks = template
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    throw new Error("No questions were found in the uploaded template.");
  }

  return blocks.map((block, blockIndex) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const prompt = readTemplateValue(lines, /^Question(?:\s+\d+)?\s*:/i, "Question:");
    const options = {
      A: readTemplateValue(lines, /^Option A\s*:/i, "Option A:"),
      B: readTemplateValue(lines, /^Option B\s*:/i, "Option B:"),
      C: readTemplateValue(lines, /^Option C\s*:/i, "Option C:"),
      D: readTemplateValue(lines, /^Option D\s*:/i, "Option D:"),
    } satisfies QuestionOptions;
    const answer = readTemplateValue(lines, /^(?:Answer|Correct Answer)\s*:/i, "Answer:")
      .toUpperCase() as OptionKey;

    try {
      return validateExamQuestionInput({
        prompt,
        options,
        correctOptionKey: answer,
      });
    } catch (error) {
      throw new Error(
        `Question ${blockIndex + 1}: ${
          error instanceof Error ? error.message : "Invalid template question."
        }`,
      );
    }
  });
}

function readTemplateValue(lines: string[], pattern: RegExp, label: string) {
  const line = lines.find((candidate) => pattern.test(candidate));

  if (!line) {
    throw new Error(`Missing "${label}" line.`);
  }

  const value = line.replace(pattern, "").trim();

  if (!value) {
    throw new Error("Template values cannot be empty.");
  }

  return value;
}

function normalizeStoredQuestionOptions(options: unknown): QuestionOptions {
  if (Array.isArray(options)) {
    return {
      A: String(options[0] ?? "").trim(),
      B: String(options[1] ?? "").trim(),
      C: String(options[2] ?? "").trim(),
      D: String(options[3] ?? "").trim(),
    };
  }

  if (options && typeof options === "object") {
    const optionRecord = options as Partial<Record<OptionKey, unknown>>;

    return {
      A: String(optionRecord.A ?? "").trim(),
      B: String(optionRecord.B ?? "").trim(),
      C: String(optionRecord.C ?? "").trim(),
      D: String(optionRecord.D ?? "").trim(),
    };
  }

  return {
    A: "",
    B: "",
    C: "",
    D: "",
  };
}

function normalizeStoredCorrectOptionKey(question: {
  options: QuestionOptions;
  correctOptionKey?: unknown;
  correctOptionIndex?: unknown;
}) {
  if (
    typeof question.correctOptionKey === "string"
    && OPTION_KEYS.includes(question.correctOptionKey as OptionKey)
  ) {
    return question.correctOptionKey as OptionKey;
  }

  if (
    typeof question.correctOptionIndex === "number"
    && Number.isInteger(question.correctOptionIndex)
    && question.correctOptionIndex >= 0
    && question.correctOptionIndex < OPTION_KEYS.length
  ) {
    return OPTION_KEYS[question.correctOptionIndex];
  }

  const fallbackKey = OPTION_KEYS.find((optionKey) => question.options[optionKey]);
  return fallbackKey ?? "A";
}
