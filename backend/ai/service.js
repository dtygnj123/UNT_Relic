import { GoogleGenAI } from "@google/genai";
import {
  PROMPTS,
  fillTemplate,
  formatReplies,
  truncateContent,
} from "./prompts.js";

let aiClient;

function getClient() {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return aiClient;
}

function buildInput(systemInstruction, userInput) {
  if (!systemInstruction) return userInput;
  return `${systemInstruction.trim()}\n\n${userInput.trim()}`;
}

function extractInteractionText(interaction) {
  if (interaction?.output_text?.trim()) {
    return interaction.output_text.trim();
  }

  const steps = interaction?.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step.type !== "model_output" || !step.content) continue;

    const textParts = step.content
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text.trim())
      .filter(Boolean);

    if (textParts.length) {
      return textParts.join("\n");
    }
  }

  return "";
}

function parseJsonResponse(text) {
  if (!text) {
    throw new Error("AI returned an empty response.");
  }

  let candidate = text.trim();

  const fencedMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    candidate = fencedMatch[1].trim();
  }

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error(
        `AI response was not valid JSON. Received: ${candidate.slice(0, 200)}`,
      );
    }

    try {
      return JSON.parse(objectMatch[0]);
    } catch (error) {
      throw new Error(
        `AI response was not valid JSON: ${error.message}. Received: ${candidate.slice(0, 200)}`,
      );
    }
  }
}

function buildMultimodalInput(systemInstruction, userInput, mediaParts = []) {
  const text = buildInput(systemInstruction, userInput);
  const parts = Array.isArray(mediaParts)
    ? mediaParts.filter(
        (part) =>
          part &&
          (part.type === "image" || part.type === "document") &&
          part.data &&
          part.mime_type,
      )
    : [];

  if (!parts.length) {
    return text;
  }

  // Media first tends to improve visual/document understanding.
  return [
    ...parts.map((part) => ({
      type: part.type,
      data: part.data,
      mime_type: part.mime_type,
    })),
    { type: "text", text },
  ];
}

export async function callGeminiJson({
  systemInstruction,
  userInput,
  schema = null,
  mediaParts = [],
  model = process.env.GEMINI_MODEL,
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from backend/.env");
  }
  if (!model) {
    throw new Error("GEMINI_MODEL is missing from backend/.env");
  }
  if (!schema) {
    throw new Error("A JSON schema is required for structured Gemini output.");
  }

  const interaction = await getClient().interactions.create({
    model,
    input: buildMultimodalInput(systemInstruction, userInput, mediaParts),
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema,
    },
  });

  const rawText = extractInteractionText(interaction);
  return parseJsonResponse(rawText);
}

async function runPrompt(promptKey, variables, mediaParts = []) {
  const prompt = PROMPTS[promptKey];
  const userInput = fillTemplate(prompt.userTemplate, variables);

  return callGeminiJson({
    systemInstruction: prompt.system,
    userInput,
    schema: prompt.schema,
    mediaParts,
  });
}

export async function tagFile({
  title,
  description = "",
  contentType = "",
  fileContent = "",
  courseDept = "",
  courseNum = "",
  courseName = "",
  mediaParts = [],
}) {
  return runPrompt(
    "tagFile",
    {
      title,
      description,
      content_type: contentType,
      file_content: truncateContent(fileContent),
      course_dept: courseDept,
      course_num: courseNum,
      course_name: courseName,
    },
    mediaParts,
  );
}

export async function generatePreview({
  title,
  description = "",
  fileContent = "",
  mediaParts = [],
}) {
  return runPrompt(
    "generatePreview",
    {
      title,
      description,
      file_content: truncateContent(fileContent),
    },
    mediaParts,
  );
}

export async function generateSolvedSummary({
  questionText,
  fileTitle = "",
  fileSummary = "",
  courseDept = "",
  courseNum = "",
  replies = [],
  mediaParts = [],
}) {
  return runPrompt(
    "generateSolvedSummary",
    {
      question_text: questionText,
      file_title: fileTitle,
      file_summary: fileSummary,
      course_dept: courseDept,
      course_num: courseNum,
      replies_formatted: formatReplies(replies),
    },
    mediaParts,
  );
}

export async function generatePracticeQuestions({
  fileTitle,
  fileContent = "",
  aiTags = [],
  courseDept = "",
  courseNum = "",
  courseName = "",
  solvedSummary = "",
  mediaParts = [],
}) {
  return runPrompt(
    "generatePractice",
    {
      file_title: fileTitle,
      file_content: truncateContent(fileContent),
      ai_tags: aiTags,
      course_dept: courseDept,
      course_num: courseNum,
      course_name: courseName,
      solved_summary: solvedSummary,
    },
    mediaParts,
  );
}

export async function gradePracticeAnswer({
  questionText,
  modelAnswer = "",
  studentAnswer = "",
  explanation = "",
}) {
  return runPrompt("gradePracticeAnswer", {
    question_text: questionText,
    model_answer: modelAnswer,
    student_answer: studentAnswer,
    explanation,
  });
}

export async function generateCheatSheet({
  courseDept = "",
  courseNum = "",
  courseName = "",
  notes = [],
  mediaParts = [],
}) {
  const notesFormatted = formatCheatSheetNotes(notes);

  return runPrompt(
    "generateCheatSheet",
    {
      course_dept: courseDept,
      course_num: courseNum,
      course_name: courseName,
      note_count: String(notes.length),
      notes_formatted: notesFormatted,
    },
    mediaParts,
  );
}

function formatCheatSheetNotes(notes = []) {
  if (!notes.length) {
    return "(no notes provided)";
  }

  return notes
    .map((note, index) => {
      const title = note.title || `Note ${index + 1}`;
      const description = note.description || "";
      const tags = Array.isArray(note.ai_tags) ? note.ai_tags.join(", ") : "";
      const preview = note.ai_preview || "";
      const summary = note.ai_summary || "";
      const hasMedia = Boolean(note.hasMedia);
      const content = hasMedia
        ? "[See attached document/image for this note.]"
        : truncateContent(note.fileContent || "", 4000);

      return [
        `--- Note ${index + 1}: ${title} ---`,
        description ? `Description: ${description}` : null,
        tags ? `Tags: ${tags}` : null,
        preview ? `Preview: ${preview}` : null,
        summary ? `Summary: ${summary}` : null,
        `Content:\n${content}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export async function processUploadedFile(fileData) {
  const mediaParts = fileData.mediaParts || [];

  const { ai_tags } = await tagFile({
    ...fileData,
    mediaParts,
  });
  const { ai_preview } = await generatePreview({
    title: fileData.title,
    description: fileData.description,
    fileContent: fileData.fileContent,
    mediaParts,
  });

  return { ai_tags, ai_preview };
}

export async function processSolvedQuestion(questionData) {
  const { solved_summary } = await generateSolvedSummary(questionData);
  return { solved_summary };
}

export async function processSolvedFile({ file, comments = [], mediaParts = [] }) {
  const questionText = [file.title, file.description].filter(Boolean).join("\n\n");

  const { solved_summary } = await generateSolvedSummary({
    questionText,
    fileTitle: file.title || "",
    fileSummary: file.ai_preview || file.description || "",
    courseDept: file.course_dept || "",
    courseNum: file.course_num || "",
    replies: comments,
    mediaParts,
  });

  return { ai_summary: solved_summary };
}
