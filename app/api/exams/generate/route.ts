import { errorResponse, successResponse } from "@/lib/api";
import { type ExamQuestionInput, validateExamQuestionInput } from "@/lib/exam-questions";
import { getServerEnv } from "@/lib/env";

const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "options", "correctOptionKey"],
        properties: {
          prompt: {
            type: "string",
          },
          options: {
            type: "object",
            additionalProperties: false,
            required: ["A", "B", "C", "D"],
            properties: {
              A: { type: "string" },
              B: { type: "string" },
              C: { type: "string" },
              D: { type: "string" },
            },
          },
          correctOptionKey: {
            type: "string",
            enum: ["A", "B", "C", "D"],
          },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lectureNotes = body.lectureNotes?.trim?.() ?? "";
    const additionalContext = body.additionalContext?.trim?.() ?? "";
    const questionCount = Number(body.questionCount ?? 5);
    const { openAiApiKey, openAiModel } = getServerEnv();

    if (!lectureNotes) {
      return errorResponse("Lecture notes are required.");
    }

    if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 50) {
      return errorResponse("Question count must be between 1 and 50.");
    }

    if (!openAiApiKey) {
      return errorResponse("OPENAI_API_KEY is not configured.", 500);
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: openAiModel || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Generate multiple-choice exam questions. Every question must have exactly four options named A, B, C, and D. The correctOptionKey must match the correct option letter.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Create ${questionCount} exam questions from these lecture notes.\n\nLecture notes:\n${lectureNotes}\n\nAdditional context:\n${additionalContext || "None provided."}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "generated_exam_questions",
            strict: true,
            schema: questionSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      const details = await safeReadJson(response);
      return errorResponse("OpenAI question generation failed.", 502, {
        status: response.status,
        response: details,
      });
    }

    const data = await response.json();
    const outputText = extractOutputText(data);

    if (!outputText) {
      return errorResponse("OpenAI did not return a question set.", 502);
    }

    const parsed = JSON.parse(outputText) as { questions?: ExamQuestionInput[] };
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.map((question) => validateExamQuestionInput(question))
      : [];

    if (questions.length !== questionCount) {
      return errorResponse("OpenAI returned an unexpected number of questions.", 502, {
        expected: questionCount,
        received: questions.length,
      });
    }

    return successResponse({ questions });
  } catch (error) {
    return errorResponse("Unable to generate exam questions.", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function safeReadJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractOutputText(payload: unknown) {
  if (
    payload
    && typeof payload === "object"
    && "output_text" in payload
    && typeof payload.output_text === "string"
  ) {
    return payload.output_text;
  }

  if (
    !payload
    || typeof payload !== "object"
    || !("output" in payload)
    || !Array.isArray(payload.output)
  ) {
    return "";
  }

  const outputText = payload.output
    .flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
        return [];
      }

      return item.content.flatMap((contentItem: unknown) => {
        if (
          contentItem
          && typeof contentItem === "object"
          && "type" in contentItem
          && contentItem.type === "output_text"
          && "text" in contentItem
          && typeof contentItem.text === "string"
        ) {
          return [contentItem.text];
        }

        return [];
      });
    })
    .join("\n")
    .trim();

  return outputText;
}
