import express from "express";
import { pool } from "../db.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();
const portraitDirectory = "uploads/portraits";

if (!fs.existsSync(portraitDirectory)) {
  fs.mkdirSync(portraitDirectory, { recursive: true });
}

const portraitStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, portraitDirectory);
  },

  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname);

    cb(null, `${req.params.userId}-${Date.now()}${extension}`);
  },
});

const uploadPortrait = multer({
  storage: portraitStorage,

  limits: {
    fileSize: 2 * 1024 * 1024,
  },

  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }

    cb(null, true);
  },
});

router.patch(
  "/:userId/portrait",
  uploadPortrait.single("portrait"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (!req.file) {
        return res.status(400).json({
          error: "Please select an image.",
        });
      }

      const portraitUrl = `/uploads/portraits/${req.file.filename}`;

      const result = await pool.query(
        `UPDATE users
         SET portrait_url = $1
         WHERE user_id = $2
         RETURNING *`,
        [portraitUrl, userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Portrait upload error:", err);

      res.status(500).json({
        error: "Failed to upload portrait",
      });
    }
  },
);

router.post("/", async (req, res) => {
  try {
    const { userId, userName, email, program, yearOfStudy } = req.body;
    const result = await pool.query(
      `INSERT INTO users 
       (user_id, user_name, email, program, year_of_study)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, userName, email, program, yearOfStudy],
    );
    const io = req.app.get("io");
    if (io) {
      io.emit("user_created", result.rows[0]);
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      userId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get user" });
  }
});

//
router.patch("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { userName, program, yearOfStudy } = req.body;
    const result = await pool.query(
      `UPDATE users 
      SET 
        user_name = $1, 
        program = $2, 
        year_of_study = $3 
        
      WHERE user_id = $4 RETURNING *`,
      [userName, program, yearOfStudy, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to update user",
    });
  }
});

export default router;
