import API_URL from "../config";

const API_BASE = API_URL;

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "AI request failed.");
  }
  return data;
}

export function tagFile(payload) {
  return postJson("/api/ai/file/tag", payload);
}

export function generatePreview(payload) {
  return postJson("/api/ai/file/preview", payload);
}

export function processUploadedFile(payload) {
  return postJson("/api/ai/file/process", payload);
}

export function generateSolvedSummary(payload) {
  return postJson("/api/ai/question/summary", payload);
}

export function generatePracticeQuestions(payload) {
  return postJson("/api/ai/practice/generate", payload);
}

export async function gradePracticeAnswer(payload) {
  const response = await fetch(`${API_BASE}/api/ai/practice/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  // 503 with aiUnavailable is an expected fallback path after retries.
  if (data.aiUnavailable) {
    return data;
  }

  if (!response.ok) {
    throw new Error(data.error || "AI grading failed.");
  }

  return data;
}
