import express from "express";
import path from "path";
import { pool } from "../db.js";
import multer from "multer";
import {
  processUploadedFile,
  processSolvedFile,
  generatePracticeQuestions,
} from "../ai/service.js";
import { loadFileForAi } from "../ai/fileMedia.js";
import { withAiRetry } from "../ai/retry.js";
import {
  matchesCourse,
  resolveCourseIdentity,
} from "../utils/courseIdentity.js";

const router = express.Router();

const runningAiJobs = new Set();

function beginAiJob(key) {
  if (runningAiJobs.has(key)) {
    return false;
  }
  runningAiJobs.add(key);
  return true;
}

function endAiJob(key) {
  runningAiJobs.delete(key);
}

const FILE_SELECT = `
  files.file_id,
  files.user_id,
  files.title,
  files.description,
  files.course_dept,
  files.course_num,
  files.course_name,
  files.content_type,
  files.file_name,
  files.file_type,
  files.file_url,
  files.ai_tags,
  files.ai_preview,
  files.ai_summary,
  files.ai_practice,
  files.ai_upload_status,
  files.ai_solve_status,
  files.solved,
  files.rating_positive,
  files.rating_negative,
  files.uploaded_at,
  CASE
  WHEN files.is_anonymous THEN NULL
  ELSE users.user_name
END AS user_name
`;

async function getFileForClient(fileId) {
  const result = await pool.query(
    `
    SELECT
      ${FILE_SELECT}
    FROM files
    JOIN users
      ON files.user_id = users.user_id
    WHERE files.file_id = $1
    `,
    [fileId],
  );

  return result.rows[0] || null;
}

function emitFileUpdate(io, eventName, fileForClient) {
  if (io && fileForClient) {
    io.emit(eventName, fileForClient);
  }
}

async function setUploadStatus(fileId, status) {
  await pool.query(
    `
    UPDATE files
    SET ai_upload_status = $2
    WHERE file_id = $1
    `,
    [fileId, status],
  );
}

async function setSolveStatus(fileId, status) {
  await pool.query(
    `
    UPDATE files
    SET ai_solve_status = $2
    WHERE file_id = $1
    `,
    [fileId, status],
  );
}

async function runUploadAiJob(fileId, io) {
  const jobKey = `upload:${fileId}`;
  if (!beginAiJob(jobKey)) {
    console.log(`Upload AI job already running for file ${fileId}`);
    return;
  }

  try {
    await setUploadStatus(fileId, "pending");
    let updated = await getFileForClient(fileId);
    emitFileUpdate(io, "file-ai-updated", updated);

    const result = await withAiRetry(async () => {
      const file = await getFileForClient(fileId);
      if (!file) {
        throw new Error("File not found for AI upload job.");
      }

      const loaded = await loadFileForAi(file);
      return processUploadedFile({
        title: file.title,
        description: file.description || "",
        contentType: file.content_type || "",
        fileContent: loaded.textContent,
        mediaParts: loaded.mediaParts,
        courseDept: file.course_dept || "",
        courseNum: file.course_num || "",
        courseName: file.course_name || "",
      });
    });

    await pool.query(
      `
      UPDATE files
      SET ai_tags = $2,
          ai_preview = $3,
          ai_upload_status = 'ready'
      WHERE file_id = $1
      `,
      [fileId, result.ai_tags || [], result.ai_preview || null],
    );

    updated = await getFileForClient(fileId);
    emitFileUpdate(io, "file-ai-updated", updated);
    console.log(`AI upload processing finished for file ${fileId}`);
  } catch (err) {
    console.error(`AI upload processing failed for file ${fileId}:`, err);
    try {
      await setUploadStatus(fileId, "failed");
      const updated = await getFileForClient(fileId);
      emitFileUpdate(io, "file-ai-updated", updated);
    } catch (statusErr) {
      console.error("Failed to persist upload AI failure status:", statusErr);
    }
  } finally {
    endAiJob(jobKey);
  }
}

async function runSolvedAiJob(fileId, io) {
  const jobKey = `solve:${fileId}`;
  if (!beginAiJob(jobKey)) {
    console.log(`Solve AI job already running for file ${fileId}`);
    return;
  }

  try {
    await setSolveStatus(fileId, "pending");
    let updated = await getFileForClient(fileId);
    emitFileUpdate(io, "file-ai-updated", updated);
    emitFileUpdate(io, "file-solved-updated", updated);

    const result = await withAiRetry(async () => {
      const file = await getFileForClient(fileId);
      if (!file) {
        throw new Error("File not found for AI solved job.");
      }

      const commentsResult = await pool.query(
        `
        SELECT
          comments.content,
          comments.created_at,
          users.user_name
        FROM comments
        JOIN users ON comments.user_id = users.user_id
        WHERE comments.file_id = $1
          AND comments.question_id IS NULL
        ORDER BY comments.created_at ASC
        `,
        [fileId],
      );

      const loaded = await loadFileForAi(file);

      const { ai_summary } = await processSolvedFile({
        file,
        comments: commentsResult.rows,
        mediaParts: loaded.mediaParts,
      });

      const aiPractice = await generatePracticeQuestions({
        fileTitle: file.title,
        fileContent: loaded.textContent,
        mediaParts: loaded.mediaParts,
        aiTags: file.ai_tags || [],
        courseDept: file.course_dept || "",
        courseNum: file.course_num || "",
        courseName: file.course_name || "",
        solvedSummary: ai_summary,
      });

      return { ai_summary, aiPractice };
    });

    await pool.query(
      `
      UPDATE files
      SET ai_summary = $2,
          ai_practice = $3,
          ai_solve_status = 'ready'
      WHERE file_id = $1
      `,
      [fileId, result.ai_summary, result.aiPractice],
    );

    updated = await getFileForClient(fileId);
    emitFileUpdate(io, "file-ai-updated", updated);
    emitFileUpdate(io, "file-solved-updated", updated);
    console.log(`AI solved processing finished for file ${fileId}`);
  } catch (err) {
    console.error(`AI solved processing failed for file ${fileId}:`, err);
    try {
      await setSolveStatus(fileId, "failed");
      const updated = await getFileForClient(fileId);
      emitFileUpdate(io, "file-ai-updated", updated);
      emitFileUpdate(io, "file-solved-updated", updated);
    } catch (statusErr) {
      console.error("Failed to persist solved AI failure status:", statusErr);
    }
  } finally {
    endAiJob(jobKey);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, "uploads/");
  },

  filename: (req, file, callback) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1000000,
    )}${path.extname(file.originalname)}`;

    callback(null, uniqueName);
  },
});

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/css",
  "text/xml",
]);

function isAllowedUploadFile(file) {
  const mime = (file.mimetype || "").toLowerCase();
  const name = (file.originalname || "").toLowerCase();

  if (mime === "application/json" || name.endsWith(".json")) {
    return false;
  }

  return (
    mime.startsWith("image/") ||
    mime.startsWith("text/") ||
    ALLOWED_UPLOAD_MIME_TYPES.has(mime)
  );
}

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedUploadFile(file)) {
      return cb(new Error("Only image, PDF, and text files are allowed."));
    }
    cb(null, true);
  },
});

//Get all uploaded files.
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ${FILE_SELECT}
      FROM files
      JOIN users
        ON files.user_id = users.user_id
      ORDER BY files.uploaded_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Failed to get files:", err);

    res.status(500).json({
      error: "Failed to get files",
    });
  }
});

// Get files for one course (used by cheat sheet generation).
// Matches explicit course fields and title-inferred codes (CSC343, CSCC43, ...).
router.get("/by-course", async (req, res) => {
  try {
    const courseDept = String(req.query.course_dept || "").trim();
    const courseNum = String(req.query.course_num || "").trim();

    if (!courseDept || !courseNum) {
      return res.status(400).json({
        error: "course_dept and course_num are required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        ${FILE_SELECT}
      FROM files
      JOIN users
        ON files.user_id = users.user_id
      ORDER BY files.uploaded_at DESC
      `,
    );

    const files = result.rows.filter((file) =>
      matchesCourse(file, courseDept, courseNum),
    );
    const resolved = files.map((file) => resolveCourseIdentity(file)).find(Boolean);

    res.json({
      course_dept: courseDept.toUpperCase(),
      course_num: courseNum.toUpperCase(),
      course_name: resolved?.course_name || null,
      files,
    });
  } catch (err) {
    console.error("Failed to get files by course:", err);
    res.status(500).json({
      error: "Failed to get files by course",
    });
  }
});

// GET /api/files/recent/:userId
// Return the user's four most recently viewed files.
router.get("/recent/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `
      SELECT
        files.file_id,
        files.title,
        files.course_dept,
        files.course_num,
        files.course_name,
        recent.position
      FROM users
      CROSS JOIN LATERAL
        UNNEST(users.recent_file_ids)
        WITH ORDINALITY AS recent(file_id, position)
      JOIN files
        ON files.file_id = recent.file_id
      WHERE users.user_id = $1
      ORDER BY recent.position
      LIMIT 4
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Failed to fetch recent files:", err);

    res.status(500).json({
      error: "Failed to fetch recent files",
    });
  }
});

//Get one file by its ID.
router.get("/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    const result = await pool.query(
      `
      SELECT
        ${FILE_SELECT}
      FROM files
      JOIN users
        ON files.user_id = users.user_id
      WHERE files.file_id = $1
      `,
      [fileId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "File not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Failed to get file:", err);

    res.status(500).json({
      error: "Failed to get file",
    });
  }
});

//Create a new file record.
//This stores file metadata in PostgreSQL, then runs AI tagging/preview in the background.
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const {
      userId,
      title,
      description,
      courseDept,
      courseNum,
      courseName,
      contentType,
      isAnonymous,
    } = req.body || {};
    const anonymousValue = isAnonymous === "true";

    if (!userId || !title || !req.file) {
      return res.status(400).json({
        error: "userId, title, and file are required",
      });
    }

    let normalizedDept = String(courseDept || "").trim() || null;
    let normalizedNum = String(courseNum || "").trim() || null;
    let normalizedName = String(courseName || "").trim() || null;

    // Backfill missing course fields from the title when possible.
    if (!normalizedDept || !normalizedNum) {
      const inferred = resolveCourseIdentity({
        title,
        description,
        course_dept: normalizedDept,
        course_num: normalizedNum,
        course_name: normalizedName,
      });
      if (inferred) {
        normalizedDept = inferred.course_dept;
        normalizedNum = inferred.course_num;
        normalizedName = inferred.course_name;
      }
    }

    const fileName = req.file.originalname;
    const fileType = req.file.mimetype;

    const baseUrl = process.env.API_URL || "http://localhost:3001";
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    const result = await pool.query(
      `
      INSERT INTO files (
        user_id,
        title,
        description,
        course_dept,
        course_num,
        course_name,
        content_type,
        file_name,
        file_type,
        file_url,
        is_anonymous,
        ai_tags,
        ai_preview,
        ai_upload_status,
        solved
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        NULL,
        NULL,
        'pending',
        FALSE
      )
      RETURNING *
      `,
      [
        userId,
        title,
        description || null,
        normalizedDept,
        normalizedNum,
        normalizedName,
        contentType || null,
        fileName,
        fileType,
        fileUrl,
        anonymousValue,
      ],
    );

    const savedFile = result.rows[0];

    const userResult = await pool.query(
      `
      SELECT user_name
      FROM users
      WHERE user_id = $1
      `,
      [userId],
    );

    const fileForClient = {
      ...savedFile,
      user_name: savedFile.is_anonymous
        ? null
        : userResult.rows[0]?.user_name || "Unknown user",
    };

    const io = req.app.get("io");

    if (io) {
      io.emit("file-created", fileForClient);
    }

    res.status(201).json(fileForClient);

    // Do not await — upload response returns immediately.
    void runUploadAiJob(savedFile.file_id, io);
  } catch (err) {
    console.error("Failed to create file:", err);

    if (err.code === "23503") {
      return res.status(400).json({
        error: "The selected user does not exist",
      });
    }

    res.status(500).json({
      error: "Failed to create file",
    });
  }
});

router.delete("/:fileId", async (req, res) => {
  const client = await pool.connect();

  try {
    const fileId = Number(req.params.fileId);
    const { userId } = req.body || {};

    if (!Number.isInteger(fileId)) {
      return res.status(400).json({
        error: "Invalid file ID",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "User ID is required",
      });
    }

    await client.query("BEGIN");

    // Confirm that this post belongs to the logged-in user.
    const fileResult = await client.query(
      `
      SELECT *
      FROM files
      WHERE file_id = $1
        AND user_id = $2
      `,
      [fileId, userId],
    );

    if (fileResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "File not found or you cannot delete this post",
      });
    }

    // Remove comments that reference this file first.
    await client.query(
      `
      DELETE FROM comments
      WHERE file_id = $1
      `,
      [fileId],
    );

    // Remove the file record.
    const deleteResult = await client.query(
      `
      DELETE FROM files
      WHERE file_id = $1
        AND user_id = $2
      RETURNING *
      `,
      [fileId, userId],
    );

    // Remove the deleted ID from every user's recent list.
    await client.query(
      `
      UPDATE users
      SET recent_file_ids = ARRAY_REMOVE(recent_file_ids, $1)
      WHERE $1 = ANY(COALESCE(recent_file_ids, '{}'))
      `,
      [fileId],
    );

    await client.query("COMMIT");

    const deletedFile = deleteResult.rows[0];
    const io = req.app.get("io");

    console.log("Socket.IO available:", Boolean(io));
    console.log("Emitting deleted file:", deletedFile.file_id);

    if (io) {
      io.emit("file-deleted", {
        file_id: deletedFile.file_id,
      });
    }

    res.json({
      message: "File deleted successfully",
      file: deletedFile,
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("Failed to delete file:", err);

    res.status(500).json({
      error: err.message || "Failed to delete file",
    });
  } finally {
    client.release();
  }
});

router.patch("/:fileId/solve", async (req, res) => {
  try {
    const { fileId } = req.params;

    const fileResult = await pool.query(
      `
      SELECT *
      FROM files
      WHERE file_id = $1
      `,
      [fileId],
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileResult.rows[0];

    if (file.solved) {
      return res
        .status(400)
        .json({ error: "File is already marked as solved." });
    }

    await pool.query(
      `
      UPDATE files
      SET solved = TRUE,
          ai_solve_status = 'pending'
      WHERE file_id = $1
      `,
      [fileId],
    );

    const fileForClient = await getFileForClient(fileId);
    const io = req.app.get("io");

    if (io) {
      io.emit("file-solved-updated", fileForClient);
    }

    // Mark solved immediately; summary + practice run in the background.
    res.json(fileForClient);
    void runSolvedAiJob(fileId, io);
  } catch (err) {
    console.error("Failed to mark file as solved:", err);
    res.status(500).json({
      error: err.message || "Failed to mark file as solved",
    });
  }
});

// Manually retry a failed AI background job.
router.post("/:fileId/retry-ai", async (req, res) => {
  try {
    const { fileId } = req.params;
    const job = req.body?.job || "upload";

    if (job !== "upload" && job !== "solve") {
      return res.status(400).json({
        error: 'job must be "upload" or "solve"',
      });
    }

    const file = await getFileForClient(fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const io = req.app.get("io");

    if (job === "upload") {
      if (file.ai_upload_status === "ready" && file.ai_preview) {
        return res.json(file);
      }

      await setUploadStatus(fileId, "pending");
      const pendingFile = await getFileForClient(fileId);
      emitFileUpdate(io, "file-ai-updated", pendingFile);
      res.json(pendingFile);
      void runUploadAiJob(fileId, io);
      return;
    }

    if (!file.solved) {
      return res.status(400).json({
        error: "File must be marked as solved before retrying solve AI.",
      });
    }

    if (file.ai_solve_status === "ready" && file.ai_summary) {
      return res.json(file);
    }

    await setSolveStatus(fileId, "pending");
    const pendingFile = await getFileForClient(fileId);
    emitFileUpdate(io, "file-ai-updated", pendingFile);
    emitFileUpdate(io, "file-solved-updated", pendingFile);
    res.json(pendingFile);
    void runSolvedAiJob(fileId, io);
  } catch (err) {
    console.error("Failed to retry AI job:", err);
    res.status(500).json({
      error: err.message || "Failed to retry AI job",
    });
  }
});

router.patch("/:fileId/like", async (req, res) => {
  try {
    const { fileId } = req.params;

    const result = await pool.query(
      `
      UPDATE files
      SET rating_positive = rating_positive + 1
      WHERE file_id = $1
      RETURNING file_id, rating_positive, rating_negative
      `,
      [fileId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "File not found",
      });
    }

    const updatedFile = result.rows[0];

    const io = req.app.get("io");

    if (io) {
      io.emit("file-rating-updated", updatedFile);
    }

    res.json(updatedFile);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to like file",
    });
  }
});

router.patch("/:fileId/dislike", async (req, res) => {
  try {
    const { fileId } = req.params;

    const result = await pool.query(
      `
      UPDATE files
      SET rating_negative = rating_negative + 1
      WHERE file_id = $1
      RETURNING file_id, rating_positive, rating_negative
      `,
      [fileId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "File not found",
      });
    }

    const updatedFile = result.rows[0];

    const io = req.app.get("io");

    if (io) {
      io.emit("file-rating-updated", updatedFile);
    }

    res.json(updatedFile);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to dislike file",
    });
  }
});

//Get all comments belonging to one file.
router.get("/:fileId/comments", async (req, res) => {
  try {
    const { fileId } = req.params;

    const result = await pool.query(
      `
      SELECT
        comments.comment_id,
        comments.file_id,
        comments.user_id,
        comments.content,
        comments.rating_positive,
        comments.rating_negative,
        comments.created_at,
        users.user_name
      FROM comments
      JOIN users
        ON comments.user_id = users.user_id
      WHERE comments.file_id = $1
        AND comments.question_id IS NULL
      ORDER BY comments.created_at DESC
      `,
      [fileId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Failed to get comments:", err);

    res.status(500).json({
      error: "Failed to get comments",
    });
  }
});

//Create a new comment for one file.
router.post("/:fileId/comments", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId, content } = req.body || {};

    if (!userId || !content?.trim()) {
      return res.status(400).json({
        error: "userId and content are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO comments (
        file_id,
        question_id,
        user_id,
        content
      )
      VALUES ($1, NULL, $2, $3)
      RETURNING *
      `,
      [fileId, userId, content.trim()],
    );

    const savedComment = result.rows[0];

    const userResult = await pool.query(
      `
      SELECT user_name
      FROM users
      WHERE user_id = $1
      `,
      [userId],
    );

    const commentForClient = {
      ...savedComment,
      user_name: userResult.rows[0]?.user_name || "Unknown user",
    };

    const io = req.app.get("io");

    if (io) {
      io.emit("comment-created", commentForClient);
    }

    res.status(201).json(commentForClient);
  } catch (err) {
    console.error("Failed to create comment:", err);

    if (err.code === "23503") {
      return res.status(400).json({
        error: "The selected file or user does not exist",
      });
    }

    res.status(500).json({
      error: "Failed to create comment",
    });
  }
});

/*
PATCH /api/files/:fileId/comments/:commentId/like

Increase a comment's positive rating.
*/
router.patch("/:fileId/comments/:commentId/like", async (req, res) => {
  try {
    const { fileId, commentId } = req.params;

    const result = await pool.query(
      `
        UPDATE comments
        SET rating_positive = rating_positive + 1
        WHERE comment_id = $1
          AND file_id = $2
          AND question_id IS NULL
        RETURNING
          comment_id,
          file_id,
          rating_positive,
          rating_negative
        `,
      [commentId, fileId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Comment not found",
      });
    }

    const updatedComment = result.rows[0];

    const io = req.app.get("io");

    if (io) {
      io.emit("comment-rating-updated", updatedComment);
    }

    res.json(updatedComment);
  } catch (err) {
    console.error("Failed to like comment:", err);

    res.status(500).json({
      error: "Failed to like comment",
    });
  }
});

/*
PATCH /api/files/:fileId/comments/:commentId/dislike

Increase a comment's negative rating.
*/
router.patch("/:fileId/comments/:commentId/dislike", async (req, res) => {
  try {
    const { fileId, commentId } = req.params;

    const result = await pool.query(
      `
        UPDATE comments
        SET rating_negative = rating_negative + 1
        WHERE comment_id = $1
          AND file_id = $2
          AND question_id IS NULL
        RETURNING
          comment_id,
          file_id,
          rating_positive,
          rating_negative
        `,
      [commentId, fileId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Comment not found",
      });
    }

    const updatedComment = result.rows[0];

    const io = req.app.get("io");

    if (io) {
      io.emit("comment-rating-updated", updatedComment);
    }

    res.json(updatedComment);
  } catch (err) {
    console.error("Failed to dislike comment:", err);

    res.status(500).json({
      error: "Failed to dislike comment",
    });
  }
});

// PATCH /api/files/:fileId/view
// Add the file to the user's four most recently viewed files.
router.patch("/:fileId/view", async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const { userId } = req.body || {};

    if (!Number.isInteger(fileId)) {
      return res.status(400).json({
        error: "Invalid file ID",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "User ID is required",
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET recent_file_ids = (
        ARRAY[$1::integer] ||
        ARRAY_REMOVE(
          COALESCE(recent_file_ids, ARRAY[]::integer[]),
          $1::integer
        )
      )[1:4]
      WHERE user_id = $2
      RETURNING recent_file_ids
      `,
      [fileId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      recentFileIds: result.rows[0].recent_file_ids,
    });
  } catch (err) {
    console.error("Failed to record file view:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;
