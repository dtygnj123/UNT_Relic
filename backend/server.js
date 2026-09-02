import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import usersRouter from "./router/users.js";
import http from "http";
import { Server } from "socket.io";
import filesRouter from "./router/files.js";
//import path from "path";
import checkoutRouter from "./router/checkout.js";
import aiRouter from "./router/ai.js";
import cheatsheetsRouter from "./router/cheatsheets.js";

// Initialize Express app
const app = express();

//Create one HTTP server
const server = http.createServer(app);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  }),
);

//Middleware to parse JSON request bodies
app.use(express.json({ limit: "2mb" }));

//Initialize Socket.IO server and attaches it to HTTP server
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

//Attach the Socket.IO server to the Express app
app.set("io", io);
//Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

//Serve static files from the "uploads" directory
app.use("/uploads", express.static("uploads"));
//Mount routers for different API endpoints
app.use("/api/users", usersRouter);
//Mount the checkout router for handling checkout-related requests
app.use("/api/checkout", checkoutRouter);
//Mount the files router for handling file-related requests
app.use("/api/files", filesRouter);
//Mount the cheat sheets router for course-level AI cheat sheets
app.use("/api/cheatsheets", cheatsheetsRouter);
//Mount the AI router for handling AI-related requests
app.use("/api/ai", aiRouter);

// Test backend
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// Test PostgreSQL connection
app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      time: result.rows[0].now,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.get("/api/debug-db", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        current_user AS database_user
    `);

    res.json(result.rows[0]);
  } catch (err) {
    console.error("DB debug failed:", err);
    res.status(500).json({
      error: err.message,
    });
  }
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (err.code === "LIMIT_FILE_SIZE") {
    const isPortrait = req.path.includes("/portrait");
    return res.status(400).json({
      error: isPortrait
        ? "Profile picture must be 2 MB or smaller."
        : "File must be 10 MB or smaller.",
    });
  }

  if (
    err.message === "Only image files are allowed." ||
    err.message === "Only image, PDF, and text files are allowed."
  ) {
    return res.status(400).json({
      error: err.message,
    });
  }

  res.status(500).json({
    error: "Internal server error",
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
