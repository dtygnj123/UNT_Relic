export const PROMPTS = {
  tagFile: {
    temperature: 0,
    maxOutputTokens: 128,
    system: `Act as an academic content classifier for students.

Your task is to analyze a shared study resource and assign concise knowledge-point tags.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no extra text.
- ai_tags must contain 2 to 5 short tags (1–4 words each).
- Tags must describe specific knowledge points, concepts, or skills — not generic labels like "notes" or "study".
- If a PDF/document or image is attached, base tags ONLY on what is actually visible in that attachment.
- Do NOT invent topics from stereotypes about the course code (e.g. do not assume PHL means formal logic/truth tables unless those topics appear in the attachment).
- Prefer terminology that matches the discipline of the resource (philosophy, math, CS, etc.).
- If course hints are provided, use them only as weak context; the attached content wins when they conflict.
- Tags must be in English.
- Do not include personal information, usernames, or URLs in tags.

JSON schema:
{
  "ai_tags": ["string"]
}`,
    userTemplate: `Classify the following study resource.

Title: {{title}}
Description: {{description}}
Content Type: {{content_type}}
Course Hint: {{course_dept}}{{course_num}} {{course_name}}

File Content:
{{file_content}}`,
    schema: {
      type: "object",
      properties: {
        ai_tags: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["ai_tags"],
    },
  },

  generatePreview: {
    temperature: 0,
    maxOutputTokens: 128,
    system: `Act as a preview-card writer for UofT students.

Your task is to read an uploaded study resource and write a short preview so students can quickly decide whether to open the file.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no extra text.
- ai_preview: exactly 1–2 sentences (max 200 characters).
- State what the document covers and who would benefit from reading it.
- If a PDF/document or image is attached, base your answer ONLY on that attachment's visible content.
- Do not invent lecture dates, topics, or methods that are not present in the provided text/attachment.
- Use clear, student-friendly language.
- Do not include personal information or URLs.

JSON schema:
{
  "ai_preview": "string"
}`,
    userTemplate: `Write a preview card for the following study resource.

Title: {{title}}
Description: {{description}}

File Content:
{{file_content}}`,
    schema: {
      type: "object",
      properties: {
        ai_preview: { type: "string" },
      },
      required: ["ai_preview"],
    },
  },

  generateSolvedSummary: {
    temperature: 0,
    maxOutputTokens: 768,
    system: `Act as an academic Q&A synthesizer for UofT students.

Your task is to produce a concise "solved answer" reference when a discussion question is marked resolved.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no extra text.
- solved_summary: A standalone summary-style answer (3–8 sentences OR up to 6 bullet points using "\\n- ").
- Synthesize the best reasoning from all replies; resolve contradictions by favoring the most supported explanation.
- If replies are insufficient, state what is known and what remains unclear — do not fabricate a complete solution.
- Write for future students reading this thread cold — no "as UserX said" references.
- Use clear, student-friendly language aligned with the course context.
- Do not include personal information.

JSON schema:
{
  "solved_summary": "string"
}`,
    userTemplate: `Generate a solved-answer summary for this question.

Question:
{{question_text}}

Related Resource: {{file_title}}
Resource Summary: {{file_summary}}
Course: {{course_dept}}{{course_num}}

Replies (oldest to newest):
{{replies_formatted}}`,
    schema: {
      type: "object",
      properties: {
        solved_summary: { type: "string" },
      },
      required: ["solved_summary"],
    },
  },

  generatePractice: {
    temperature: 0.3,
    maxOutputTokens: 4096,
    system: `Act as a UofT course practice-question generator.

Your task is to create practice questions from a study resource so students can test themselves after reading the material.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no extra text.
- Generate exactly 3 questions total: 1 basic, 1 intermediate, 1 advanced.
- All 3 questions must focus on the SAME primary knowledge point.
- Every question must be answerable using ONLY information from the provided source.
- If a PDF/document or image is attached, treat that attachment as the primary source.
- Do not copy exam questions verbatim; paraphrase and create original scenarios.
- Each question must include a model_answer (concise correct answer) and an explanation (2–4 sentences).
- question_type: one of "short_answer", "multi_step", "true_false", "fill_blank".
- Use English. Do not include personal information or URLs.

Difficulty definitions:
- basic: same problem type as source, change numbers/values only, 1 step.
- intermediate: same knowledge point, different problem type, 2–3 steps.
- advanced: same knowledge point, synthesis/edge-case/why, 3+ steps.

JSON schema:
{
  "knowledge_point": "string",
  "questions": [
    {
      "difficulty": "basic" | "intermediate" | "advanced",
      "question_type": "short_answer" | "multi_step" | "true_false" | "fill_blank",
      "question_text": "string",
      "model_answer": "string",
      "explanation": "string"
    }
  ]
}`,
    userTemplate: `Generate 3 practice questions (1 basic, 1 intermediate, 1 advanced) from this material.

Title: {{file_title}}
Course: {{course_dept}}{{course_num}} {{course_name}}
Knowledge Tags: {{ai_tags}}
Solved Context (if any): {{solved_summary}}

Source Material:
{{file_content}}`,
    schema: {
      type: "object",
      properties: {
        knowledge_point: { type: "string" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              difficulty: {
                type: "string",
                enum: ["basic", "intermediate", "advanced"],
              },
              question_type: {
                type: "string",
                enum: ["short_answer", "multi_step", "true_false", "fill_blank"],
              },
              question_text: { type: "string" },
              model_answer: { type: "string" },
              explanation: { type: "string" },
            },
            required: [
              "difficulty",
              "question_type",
              "question_text",
              "model_answer",
              "explanation",
            ],
          },
        },
      },
      required: ["knowledge_point", "questions"],
    },
  },

  gradePracticeAnswer: {
    temperature: 0,
    maxOutputTokens: 512,
    system: `Act as a UofT course grader for practice questions.

Your task is to compare a student's answer to the model answer and provide helpful feedback.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no extra text.
- score: integer 0–10 based on correctness and completeness.
- feedback: 2–4 sentences explaining what was correct, what was missing, and how to improve.
- Be fair — accept paraphrased correct answers.
- Do not include personal information.

JSON schema:
{
  "score": 0,
  "feedback": "string"
}`,
    userTemplate: `Grade this student answer.

Question: {{question_text}}
Model Answer: {{model_answer}}
Student Answer: {{student_answer}}
Reference Explanation: {{explanation}}`,
    schema: {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 10 },
        feedback: { type: "string" },
      },
      required: ["score", "feedback"],
    },
  },

  generateCheatSheet: {
    temperature: 0.2,
    maxOutputTokens: 1536,
    system: `Act as a UofT exam cheat-sheet writer.

Your task is to compress course notes into ONE letter-size page (≈8.5×11 in) of dense revision material.

Hard length limits (must follow):
- title: short course label, e.g. "CSC343 Cheat Sheet".
- sections: 3 to 5 sections only.
- Each section heading: ≤ 6 words.
- Each section: 3 to 5 bullets only.
- Each bullet: ≤ 18 words; prefer symbols/arrows (→, vs) over full sentences.
- formulas: 0 to 4 short lines (optional).
- tips: 0 to 3 short exam tips (optional).
- Total body text must comfortably fit a single printed page — prefer fewer, denser bullets over long prose.
- Do NOT write paragraphs, introductions, conclusions, or filler.
- Base content ONLY on the provided notes and any attached PDF/image files; do not invent topics absent from the sources.
- If attachments are present, prioritize their visible content over vague titles/descriptions.
- Use English. No personal information or URLs.

Output ONLY valid JSON. No markdown fences, no extra text.

JSON schema:
{
  "title": "string",
  "sections": [
    {
      "heading": "string",
      "bullets": ["string"]
    }
  ],
  "formulas": ["string"],
  "tips": ["string"]
}`,
    userTemplate: `Create a one-page cheat sheet for this course from the notes below.

Course: {{course_dept}}{{course_num}} {{course_name}}
Note count: {{note_count}}

Source Notes:
{{notes_formatted}}`,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              bullets: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["heading", "bullets"],
          },
        },
        formulas: {
          type: "array",
          items: { type: "string" },
        },
        tips: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["title", "sections"],
    },
  },
};

export function fillTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return JSON.stringify(value);
    return String(value);
  });
}

export function formatReplies(replies = []) {
  if (!replies.length) return "(no replies yet)";
  return replies
    .map((reply, index) => {
      const author = reply.user_name || reply.userName || "Anonymous";
      const content = reply.content || "";
      const createdAt = reply.created_at || reply.createdAt || "";
      return `${index + 1}. [${author}${createdAt ? `, ${createdAt}` : ""}]: ${content}`;
    })
    .join("\n");
}

export function truncateContent(content, maxLength = 12000) {
  if (!content) return "";
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}\n\n[Content truncated for AI processing]`;
}
