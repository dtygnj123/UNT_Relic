import express from "express";
import { pool } from "../db.js";
import { generateCheatSheet } from "../ai/service.js";
import { collectMediaParts, loadFileForAi } from "../ai/fileMedia.js";
import { withAiRetry } from "../ai/retry.js";
import {
  aggregateCourses,
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

function courseJobKey(courseDept, courseNum) {
  return `cheatsheet:${String(courseDept).toUpperCase()}:${courseNum}`;
}

async function getCheatsheet(courseDept, courseNum) {
  const result = await pool.query(
    `
    SELECT
      cheatsheet_id,
      course_dept,
      course_num,
      course_name,
      content,
      ai_status,
      created_at,
      updated_at
    FROM cheatsheets
    WHERE UPPER(course_dept) = UPPER($1)
      AND course_num = $2
    `,
    [courseDept, courseNum],
  );

  return result.rows[0] || null;
}

function emitCheatsheetUpdate(io, cheatsheet) {
  if (io && cheatsheet) {
    io.emit("cheatsheet-updated", cheatsheet);
  }
}

async function listAllFilesForCourseLookup() {
  const result = await pool.query(
    `
    SELECT
      file_id,
      title,
      description,
      course_dept,
      course_num,
      course_name,
      file_name,
      file_type,
      file_url,
      ai_tags,
      ai_preview,
      ai_summary,
      uploaded_at
    FROM files
    ORDER BY uploaded_at DESC
    `,
  );

  return result.rows;
}

async function getCourseFiles(courseDept, courseNum) {
  const files = await listAllFilesForCourseLookup();
  return files.filter((file) => matchesCourse(file, courseDept, courseNum));
}

async function upsertPendingCheatsheet(courseDept, courseNum, courseName) {
  const normalizedDept = String(courseDept).trim().toUpperCase();
  const normalizedNum = String(courseNum).trim();

  const result = await pool.query(
    `
    INSERT INTO cheatsheets (
      course_dept,
      course_num,
      course_name,
      content,
      ai_status,
      updated_at
    )
    VALUES ($1, $2, $3, NULL, 'pending', CURRENT_TIMESTAMP)
    ON CONFLICT (course_dept, course_num)
    DO UPDATE SET
      course_name = COALESCE(EXCLUDED.course_name, cheatsheets.course_name),
      content = NULL,
      ai_status = 'pending',
      updated_at = CURRENT_TIMESTAMP
    RETURNING
      cheatsheet_id,
      course_dept,
      course_num,
      course_name,
      content,
      ai_status,
      created_at,
      updated_at
    `,
    [normalizedDept, normalizedNum, courseName || null],
  );

  return result.rows[0];
}

async function runCheatSheetAiJob(courseDept, courseNum, io) {
  const jobKey = courseJobKey(courseDept, courseNum);
  if (!beginAiJob(jobKey)) {
    console.log(
      `Cheat sheet AI job already running for ${courseDept}${courseNum}`,
    );
    return;
  }

  try {
    const files = await getCourseFiles(courseDept, courseNum);
    if (!files.length) {
      throw new Error("No notes found for this course.");
    }

    const courseName =
      files.map((file) => resolveCourseIdentity(file)).find(Boolean)
        ?.course_name || null;

    let pending = await upsertPendingCheatsheet(
      courseDept,
      courseNum,
      courseName,
    );
    emitCheatsheetUpdate(io, pending);

    const content = await withAiRetry(async () => {
      const notes = [];
      const loadedFiles = [];

      for (const file of files) {
        const loaded = await loadFileForAi(file);
        loadedFiles.push(loaded);
        notes.push({
          title: file.title,
          description: file.description || "",
          ai_tags: file.ai_tags || [],
          ai_preview: file.ai_preview || "",
          ai_summary: file.ai_summary || "",
          fileContent: loaded.textContent,
          hasMedia: loaded.mediaParts.length > 0,
        });
      }

      return generateCheatSheet({
        courseDept,
        courseNum,
        courseName: courseName || "",
        notes,
        mediaParts: collectMediaParts(loadedFiles),
      });
    });

    const result = await pool.query(
      `
      UPDATE cheatsheets
      SET content = $3,
          ai_status = 'ready',
          course_name = COALESCE($4, course_name),
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(course_dept) = UPPER($1)
        AND course_num = $2
      RETURNING
        cheatsheet_id,
        course_dept,
        course_num,
        course_name,
        content,
        ai_status,
        created_at,
        updated_at
      `,
      [courseDept, courseNum, content, courseName],
    );

    emitCheatsheetUpdate(io, result.rows[0]);
    console.log(
      `Cheat sheet AI finished for ${courseDept}${courseNum}`,
    );
  } catch (err) {
    console.error(
      `Cheat sheet AI failed for ${courseDept}${courseNum}:`,
      err,
    );
    try {
      const failed = await pool.query(
        `
        UPDATE cheatsheets
        SET ai_status = 'failed',
            updated_at = CURRENT_TIMESTAMP
        WHERE UPPER(course_dept) = UPPER($1)
          AND course_num = $2
        RETURNING
          cheatsheet_id,
          course_dept,
          course_num,
          course_name,
          content,
          ai_status,
          created_at,
          updated_at
        `,
        [courseDept, courseNum],
      );

      if (failed.rows[0]) {
        emitCheatsheetUpdate(io, failed.rows[0]);
      } else {
        const inserted = await upsertPendingCheatsheet(
          courseDept,
          courseNum,
          null,
        );
        await pool.query(
          `
          UPDATE cheatsheets
          SET ai_status = 'failed',
              updated_at = CURRENT_TIMESTAMP
          WHERE cheatsheet_id = $1
          `,
          [inserted.cheatsheet_id],
        );
        const failedRow = await getCheatsheet(courseDept, courseNum);
        emitCheatsheetUpdate(io, failedRow);
      }
    } catch (statusErr) {
      console.error("Failed to persist cheat sheet failure status:", statusErr);
    }
  } finally {
    endAiJob(jobKey);
  }
}

function parseCourseParams(source) {
  const courseDept = String(source.course_dept || source.courseDept || "").trim();
  const courseNum = String(source.course_num || source.courseNum || "").trim();
  return { courseDept, courseNum };
}

// Distinct courses that already have uploaded notes.
// Includes files with missing course_dept by inferring codes from titles
// (e.g. "Csc343", "CSCC43") so the cheat-sheet picker stays complete.
router.get("/courses", async (req, res) => {
  try {
    const files = await listAllFilesForCourseLookup();
    res.json(aggregateCourses(files));
  } catch (err) {
    console.error("Failed to list courses for cheat sheets:", err);
    res.status(500).json({
      error: "Failed to list courses",
    });
  }
});

// Get existing cheat sheet for a course.
router.get("/", async (req, res) => {
  try {
    const { courseDept, courseNum } = parseCourseParams(req.query);

    if (!courseDept || !courseNum) {
      return res.status(400).json({
        error: "course_dept and course_num are required",
      });
    }

    const cheatsheet = await getCheatsheet(courseDept, courseNum);
    if (!cheatsheet) {
      return res.status(404).json({
        error: "Cheat sheet not found for this course",
      });
    }

    res.json(cheatsheet);
  } catch (err) {
    console.error("Failed to get cheat sheet:", err);
    res.status(500).json({
      error: "Failed to get cheat sheet",
    });
  }
});

// Start async cheat sheet generation for a course.
router.post("/generate", async (req, res) => {
  try {
    const { courseDept, courseNum } = parseCourseParams(req.body || {});

    if (!courseDept || !courseNum) {
      return res.status(400).json({
        error: "course_dept and course_num are required",
      });
    }

    const files = await getCourseFiles(courseDept, courseNum);
    if (!files.length) {
      return res.status(404).json({
        error: "No notes found for this course",
      });
    }

    const existing = await getCheatsheet(courseDept, courseNum);
    if (
      existing?.ai_status === "ready" &&
      existing.content &&
      !req.body?.force
    ) {
      return res.json(existing);
    }

    if (existing?.ai_status === "pending" && !req.body?.force) {
      return res.json(existing);
    }

    const courseName =
      files.map((file) => resolveCourseIdentity(file)).find(Boolean)
        ?.course_name || null;
    const pending = await upsertPendingCheatsheet(
      courseDept,
      courseNum,
      courseName,
    );

    const io = req.app.get("io");
    emitCheatsheetUpdate(io, pending);
    res.status(202).json(pending);
    void runCheatSheetAiJob(courseDept, courseNum, io);
  } catch (err) {
    console.error("Failed to start cheat sheet generation:", err);
    res.status(500).json({
      error: err.message || "Failed to start cheat sheet generation",
    });
  }
});

// Retry a failed (or incomplete) cheat sheet AI job.
router.post("/retry", async (req, res) => {
  try {
    const { courseDept, courseNum } = parseCourseParams(req.body || {});

    if (!courseDept || !courseNum) {
      return res.status(400).json({
        error: "course_dept and course_num are required",
      });
    }

    const files = await getCourseFiles(courseDept, courseNum);
    if (!files.length) {
      return res.status(404).json({
        error: "No notes found for this course",
      });
    }

    const existing = await getCheatsheet(courseDept, courseNum);
    if (existing?.ai_status === "ready" && existing.content) {
      return res.json(existing);
    }

    const courseName =
      files.map((file) => resolveCourseIdentity(file)).find(Boolean)
        ?.course_name ||
      existing?.course_name ||
      null;
    const pending = await upsertPendingCheatsheet(
      courseDept,
      courseNum,
      courseName,
    );

    const io = req.app.get("io");
    emitCheatsheetUpdate(io, pending);
    res.json(pending);
    void runCheatSheetAiJob(courseDept, courseNum, io);
  } catch (err) {
    console.error("Failed to retry cheat sheet AI:", err);
    res.status(500).json({
      error: err.message || "Failed to retry cheat sheet AI",
    });
  }
});

export default router;
