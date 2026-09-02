import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase.js";
import "../styles/postpage.css";
import API_URL from "../config";

export default function PostPage() {
  const navigate = useNavigate();

  const [anonymous, setAnonymous] = useState("yes");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("notes");
  const [level, setLevel] = useState("100");
  const [program, setProgram] = useState("CS");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function isAllowedFile(selectedFile) {
    const mime = (selectedFile.type || "").toLowerCase();
    const name = (selectedFile.name || "").toLowerCase();
    if (mime === "application/json" || name.endsWith(".json")) {
      return false;
    }
    return (
      mime.startsWith("image/") ||
      mime.startsWith("text/") ||
      mime === "application/pdf"
    );
  }

  function handleFileChange(e) {
    const selectedFile = e.target.files?.[0] || null;

    if (selectedFile && !isAllowedFile(selectedFile)) {
      setFile(null);
      e.target.value = "";
      setError("Only image, PDF, and text files are allowed.");
      return;
    }

    setError("");
    setFile(selectedFile);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Please select a file.");
      return;
    }

    if (!isAllowedFile(file)) {
      setError("Only image, PDF, and text files are allowed.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setError("You must be logged in to upload a file.");
      return;
    }

    const courseDept = String(program || "").trim();
    const courseNum = String(level || "").trim();

    if (!courseDept || !courseNum) {
      setError("Please select both program and course level.");
      return;
    }

    // Prefer a real course code from the title when present (e.g. CSC343 / CSCC43).
    const titleCourseMatch = title
      .toUpperCase()
      .match(/\b([A-Z]{3})([A-D]\d{2})\b|\b([A-Z]{2,4})\s*[-\s]?\s*(\d{3}[A-Z]?)\b/);
    const inferredDept = titleCourseMatch?.[1] || titleCourseMatch?.[3] || "";
    const inferredNum = titleCourseMatch?.[2] || titleCourseMatch?.[4] || "";
    const courseName =
      inferredDept && inferredNum
        ? `${inferredDept}${inferredNum}`
        : `${courseDept}${courseNum}`;

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append("userId", currentUser.uid);
      formData.append("title", title);
      formData.append("description", description);
      formData.append("courseDept", inferredDept || courseDept);
      formData.append("courseNum", inferredNum || courseNum);
      formData.append("courseName", courseName);
      formData.append("contentType", type);
      formData.append("isAnonymous", anonymous === "yes");
      formData.append("file", file);

      const response = await fetch(`${API_URL}/api/files`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload file");
      }

      console.log("Uploaded file:", data);
      navigate("/gallery");
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err.message || "Something went wrong while uploading.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToGallery() {
    navigate("/gallery");
  }

  return (
    <div className="form-container">
      <h2>Create New Post</h2>

      <form onSubmit={handleSubmit}>
        {error && <p className="error-message">{error}</p>}

        <div className="dropdown">
          <label>Do you want to Post anonymous?</label>
          <select
            value={anonymous}
            onChange={(e) => setAnonymous(e.target.value)}
            required
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div>
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="dropdown">
          <label>Type of Content</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          >
            <option value="notes">Notes</option>
            <option value="slides">Slides</option>
            <option value="practice">Practice Questions</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="dropdown">
          <label>Level of Course</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            required
          >
            <option value="100">100 Level</option>
            <option value="200">200 Level</option>
            <option value="300">300 Level</option>
            <option value="400">400 Level</option>
          </select>
        </div>

        <div className="dropdown">
          <label>Program of Course</label>
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            required
          >
            <option value="CS">CS</option>
            <option value="MAT">MAT</option>
            <option value="STA">STA</option>
            <option value="ANT">ANT</option>
            <option value="PHL">PHL</option>
            <option value="SOC">SOC</option>
            <option value="MNG">MNG</option>
            <option value="ARA">ARA</option>
            <option value="GLA">GLA</option>
            <option value="CSC">CSC</option>
          </select>
        </div>

        <div>
          <label>Content Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div>
          <label>Add File</label>
          <input
            type="file"
            accept="image/*,application/pdf,text/*,.txt,.md,.csv"
            onChange={handleFileChange}
            required
          />
        </div>

        <div>
          <button type="submit" className="loginbutton" disabled={isSubmitting}>
            {isSubmitting ? "Uploading..." : "Post"}
          </button>
        </div>

        <div>
          <button className="loginbutton" onClick={goToGallery}>
            Back
          </button>
        </div>
      </form>
    </div>
  );
}
