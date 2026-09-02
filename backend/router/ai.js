import express from "express";
import {
  tagFile,
  generatePreview,
  processUploadedFile,
  processSolvedQuestion,
  generatePracticeQuestions,
  gradePracticeAnswer,
} from "../ai/service.js";
import { withAiRetry } from "../ai/retry.js";
import { pool } from "../db.js";

const router = express.Router();

const AI_UNAVAILABLE_MESSAGE =
  "AI functionality is currently unavailable, please try again later.";

router.post("/file/tag", async (req, res) => {
  try {
    const {
      title,
      description,
      contentType,
      fileContent,
      courseDept,
      courseNum,
      courseName,
    } = req.body;

    if (!title || !fileContent) {
      return res.status(400).json({ error: "title and fileContent are required." });
    }

    const result = await tagFile({
      title,
      description,
      contentType,
      fileContent,
      courseDept,
      courseNum,
      courseName,
    });

    res.json(result);
  } catch (error) {
    console.error("File tagging failed:", error);
    res.status(500).json({ error: error.message || "AI tagging failed." });
  }
});

router.post("/file/preview", async (req, res) => {
  try {
    const { title, description, fileContent } = req.body;

    if (!title || !fileContent) {
      return res.status(400).json({ error: "title and fileContent are required." });
    }

    const result = await generatePreview({
      title,
      description,
      fileContent,
    });

    res.json(result);
  } catch (error) {
    console.error("File preview failed:", error);
    res.status(500).json({ error: error.message || "AI preview failed." });
  }
});

router.post("/file/process", async (req, res) => {
  try {
    const {
      title,
      description,
      contentType,
      fileContent,
      courseDept,
      courseNum,
      courseName,
    } = req.body;

    if (!title || !fileContent) {
      return res.status(400).json({ error: "title and fileContent are required." });
    }

    const result = await processUploadedFile({
      title,
      description,
      contentType,
      fileContent,
      courseDept,
      courseNum,
      courseName,
    });

    res.json(result);
  } catch (error) {
    console.error("File AI processing failed:", error);
    res.status(500).json({ error: error.message || "AI processing failed." });
  }
});

router.post("/question/summary", async (req, res) => {
  try {
    const {
      questionText,
      fileTitle,
      fileSummary,
      courseDept,
      courseNum,
      replies,
    } = req.body;

    if (!questionText) {
      return res.status(400).json({ error: "questionText is required." });
    }

    const result = await processSolvedQuestion({
      questionText,
      fileTitle,
      fileSummary,
      courseDept,
      courseNum,
      replies,
    });

    res.json(result);
  } catch (error) {
    console.error("Solved summary failed:", error);
    res.status(500).json({ error: error.message || "AI summary failed." });
  }
});

router.post("/practice/generate", async (req, res) => {
  try {
    const {
      fileTitle,
      fileContent,
      aiTags,
      courseDept,
      courseNum,
      courseName,
      solvedSummary,
      // isPremium, // TODO: re-enable when testing Stripe subscription
    } = req.body;

    // TODO: re-enable premium gate when testing Stripe subscription
    // if (!isPremium) {
    //   return res.status(403).json({ error: "Premium subscription required." });
    // }

    if (!fileTitle || !fileContent) {
      return res.status(400).json({ error: "fileTitle and fileContent are required." });
    }

    const result = await generatePracticeQuestions({
      fileTitle,
      fileContent,
      aiTags,
      courseDept,
      courseNum,
      courseName,
      solvedSummary,
    });

    res.json(result);
  } catch (error) {
    console.error("Practice generation failed:", error);
    res.status(500).json({ error: error.message || "Practice generation failed." });
  }
});

router.post("/practice/grade", async (req, res) => {
  try {
    const { fileId, difficulty, studentAnswer } = req.body || {};

    if (!fileId || !difficulty || !studentAnswer?.trim()) {
      return res.status(400).json({
        error: "fileId, difficulty, and studentAnswer are required.",
      });
    }

    const fileResult = await pool.query(
      `
      SELECT ai_practice, solved
      FROM files
      WHERE file_id = $1
      `,
      [fileId],
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: "File not found." });
    }

    const file = fileResult.rows[0];

    if (!file.solved) {
      return res.status(400).json({
        error: "Practice grading is only available for solved resources.",
      });
    }

    const questions = file.ai_practice?.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        error: "No practice questions found for this file.",
      });
    }

    const question = questions.find((q) => q.difficulty === difficulty);
    if (!question) {
      return res.status(404).json({
        error: `No practice question found for difficulty "${difficulty}".`,
      });
    }

    try {
      const result = await withAiRetry(() =>
        gradePracticeAnswer({
          questionText: question.question_text,
          modelAnswer: question.model_answer || "",
          studentAnswer: studentAnswer.trim(),
          explanation: question.explanation || "",
        }),
      );

      return res.json({
        score: result.score,
        feedback: result.feedback,
        aiUnavailable: false,
        model_answer: question.model_answer || "",
        explanation: question.explanation || "",
      });
    } catch (aiError) {
      console.error("Practice grading failed after retries:", aiError);
      return res.status(503).json({
        aiUnavailable: true,
        error: AI_UNAVAILABLE_MESSAGE,
        model_answer: question.model_answer || "",
        explanation: question.explanation || "",
      });
    }
  } catch (error) {
    console.error("Practice grading endpoint failed:", error);
    res.status(500).json({ error: error.message || "Practice grading failed." });
  }
});

export default router;
