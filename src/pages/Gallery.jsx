import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/gallery.css";
import socket from "../lib/socket";
import API_URL from "../config";
import Topbar from "../components/Topbar";
import { auth } from "../lib/firebase";

export default function Gallery() {
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState("");
  const [filterTag, setFilterTag] = useState("All");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [solvingFileId, setSolvingFileId] = useState(null);
  const [retryingKey, setRetryingKey] = useState("");

  const AI_UNAVAILABLE =
    "AI functionality is currently unavailable, please try again later.";

  const [user, setUser] = useState(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = auth.currentUser;

        if (!currentUser) return;

        const response = await fetch(`${API_URL}/api/users/${currentUser.uid}`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load user");
        }

        setUser(data);
      } catch (err) {
        console.error(err);
      }
    }

    async function loadFiles() {
      try {
        const response = await fetch(`${API_URL}/api/files`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load files");
        }

        setFiles(data);
      } catch (err) {
        console.error("Failed to load gallery files:", err);
        setError(err.message);
      }
    }

    function handleConnect() {
      console.log("Connected to Socket.IO:", socket.id);
    }

    function handleFileCreated(newFile) {
      console.log("New file received:", newFile);

      setFiles((currentFiles) => {
        const alreadyExists = currentFiles.some(
          (file) => file.file_id === newFile.file_id,
        );

        if (alreadyExists) {
          return currentFiles;
        }

        return [newFile, ...currentFiles];
      });
    }

    function handleRatingUpdated(updatedFile) {
      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.file_id === updatedFile.file_id
            ? {
                ...file,
                rating_positive: updatedFile.rating_positive,
                rating_negative: updatedFile.rating_negative,
              }
            : file,
        ),
      );
    }

    function mergeFileUpdate(updatedFile) {
      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          Number(file.file_id) === Number(updatedFile.file_id)
            ? { ...file, ...updatedFile }
            : file,
        ),
      );
    }

    function handleFileSolvedUpdated(updatedFile) {
      mergeFileUpdate(updatedFile);
    }

    function handleFileAiUpdated(updatedFile) {
      mergeFileUpdate(updatedFile);
    }

    function handleFileDeleted(data) {
      setFiles((currentFiles) =>
        currentFiles.filter(
          (file) => Number(file.file_id) !== Number(data.file_id),
        ),
      );
    }

    loadFiles();
    loadUser();

    socket.on("connect", handleConnect);
    socket.on("file-created", handleFileCreated);
    socket.on("file-rating-updated", handleRatingUpdated);
    socket.on("file-solved-updated", handleFileSolvedUpdated);
    socket.on("file-ai-updated", handleFileAiUpdated);
    socket.on("file-deleted", handleFileDeleted);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("file-created", handleFileCreated);
      socket.off("file-rating-updated", handleRatingUpdated);
      socket.off("file-solved-updated", handleFileSolvedUpdated);
      socket.off("file-ai-updated", handleFileAiUpdated);
      socket.on("file-deleted", handleFileDeleted);
      socket.disconnect();
    };
  }, []);

  const filteredFiles = files.filter((file) => {
    const title = file.title || "";
    const description = file.description || "";
    const courseDept = file.course_dept || "";
    const courseNum = file.course_num || "";
    const contentType = file.content_type || "";

    const searchValue = searchText.toLowerCase();

    const matchesSearch =
      title.toLowerCase().includes(searchValue) ||
      description.toLowerCase().includes(searchValue) ||
      courseDept.toLowerCase().includes(searchValue) ||
      courseNum.toLowerCase().includes(searchValue);

    const matchesTag =
      filterTag === "All" ||
      contentType.toLowerCase() === filterTag.toLowerCase();

    return matchesSearch && matchesTag;
  });

  function handleLogout() {
    navigate("/landing");
  }

  function goToProfile() {
    navigate("/profile");
  }

  function goToPost() {
    navigate("/post");
  }

  function goToFile(fileId) {
    navigate(`/comments/${fileId}`);
  }

  async function handleDelete(fileId) {
    const response = await fetch(`${API_URL}/api/files/${fileId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: auth.currentUser.uid,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete file");
    }

    setFiles((currentFiles) =>
      currentFiles.filter((file) => file.file_id !== fileId),
    );
  }

  async function likeFile(fileId) {
    try {
      const response = await fetch(`${API_URL}/api/files/${fileId}/like`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to like file");
      }

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          Number(file.file_id) === Number(data.file_id)
            ? {
                ...file,
                rating_positive: data.rating_positive,
                rating_negative: data.rating_negative,
              }
            : file,
        ),
      );
    } catch (err) {
      console.error("Like error:", err);
      setError(err.message);
    }
  }

  async function dislikeFile(fileId) {
    try {
      const response = await fetch(`${API_URL}/api/files/${fileId}/dislike`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to dislike file");
      }

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          Number(file.file_id) === Number(data.file_id)
            ? {
                ...file,
                rating_positive: data.rating_positive,
                rating_negative: data.rating_negative,
              }
            : file,
        ),
      );
    } catch (err) {
      console.error("Dislike error:", err);
      setError(err.message);
    }
  }

  async function markFileSolved(fileId) {
    try {
      setSolvingFileId(fileId);
      setError("");

      const response = await fetch(`${API_URL}/api/files/${fileId}/solve`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to mark file as solved");
      }

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          Number(file.file_id) === Number(data.file_id)
            ? { ...file, ...data }
            : file,
        ),
      );
    } catch (err) {
      console.error("Solve error:", err);
      setError(err.message);
    } finally {
      setSolvingFileId(null);
    }
  }

  async function retryAi(fileId, job) {
    const key = `${job}-${fileId}`;
    try {
      setRetryingKey(key);
      setError("");

      const response = await fetch(
        `http://localhost:3001/api/files/${fileId}/retry-ai`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to retry AI");
      }

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          Number(file.file_id) === Number(data.file_id)
            ? { ...file, ...data }
            : file,
        ),
      );
    } catch (err) {
      console.error("Retry AI error:", err);
      setError(err.message);
    } finally {
      setRetryingKey("");
    }
  }

  return (
    <>
      <Topbar>
        <button className="profile-avatar" onClick={goToProfile}>
          {user?.portrait_url ? (
            <img
              src={`${API_URL}${user.portrait_url}`}
              alt="Profile"
              className="profile-avatar-image"
            />
          ) : (
            user?.user_name?.charAt(0)?.toUpperCase() || "P"
          )}
        </button>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </Topbar>

      <div className="gallery-page">
        <h1>File Gallery</h1>

        {error && <p className="error-message">{error}</p>}

        <div className="search-section">
          <input
            type="text"
            placeholder="Search files..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
          >
            <option value="All">All</option>
            <option value="Notes">Notes</option>
            <option value="Practice">Practice</option>
            <option value="Slides">Slides</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="file-gallery">
          {filteredFiles.length === 0 ? (
            <p>No files found.</p>
          ) : (
            filteredFiles.map((file) => (
              <div className="file-card" key={file.file_id}>
                <div className="file-info">
                  <h3>
                    <button
                      className="title-btn"
                      onClick={() => goToFile(file.file_id)}
                    >
                      {file.title}
                    </button>
                  </h3>

                  <p>{file.content_type || "Other"}</p>

                  <p>Posted by {file.user_name || "anonymous user"}</p>

                  <p>
                    {file.uploaded_at
                      ? new Date(file.uploaded_at).toLocaleDateString()
                      : ""}
                  </p>

                  <a
                    href={file.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <button>Download</button>
                  </a>
                </div>

                <div className="file-details">
                  {auth.currentUser?.uid === file.user_id && (
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(file.file_id)}
                    >
                      X
                    </button>
                  )}
                  <div className="tags">
                    {file.course_dept && (
                      <span className="tag">
                        {file.course_dept}
                        {file.course_num}
                      </span>
                    )}

                    {file.content_type && (
                      <span className="tag">{file.content_type}</span>
                    )}

                    {file.ai_tags?.length > 0 &&
                      file.ai_tags.map((tag) => (
                        <span key={tag} className="tag ai-tag">
                          {tag}
                        </span>
                      ))}
                  </div>

                  {file.ai_upload_status === "failed" ? (
                    <div className="ai-error-block">
                      <p className="description ai-error">{AI_UNAVAILABLE}</p>
                      <button
                        type="button"
                        className="ai-retry-btn"
                        onClick={() => retryAi(file.file_id, "upload")}
                        disabled={retryingKey === `upload-${file.file_id}`}
                      >
                        {retryingKey === `upload-${file.file_id}`
                          ? "Retrying..."
                          : "Retry"}
                      </button>
                    </div>
                  ) : file.ai_preview ? (
                    <p className="description">{file.ai_preview}</p>
                  ) : (
                    <p className="description ai-pending">
                      AI preview generating...
                    </p>
                  )}

                  <div className="solved-status">
                    <span
                      className={`solved-tag ${file.solved ? "solved-yes" : "solved-no"}`}
                    >
                      {file.solved ? "Solved" : "Not Solved"}
                    </span>
                  </div>

                  <div className="vote-buttons">
                    <button
                      className="vote-btn vote-btn-up"
                      onClick={() => likeFile(file.file_id)}
                    >
                      {file.rating_positive ?? 0}
                    </button>

                    <button
                      className="vote-btn vote-btn-down"
                      onClick={() => dislikeFile(file.file_id)}
                    >
                      {file.rating_negative ?? 0}
                    </button>

                    {!file.solved && (
                      <button
                        className="solve-btn"
                        onClick={() => markFileSolved(file.file_id)}
                        disabled={solvingFileId === file.file_id}
                      >
                        {solvingFileId === file.file_id
                          ? "Marking solved..."
                          : "Mark Solved"}
                      </button>
                    )}

                    {file.solved && file.ai_solve_status === "failed" && (
                      <div className="ai-error-block">
                        <span className="ai-error-label">{AI_UNAVAILABLE}</span>
                        <button
                          type="button"
                          className="ai-retry-btn"
                          onClick={() => retryAi(file.file_id, "solve")}
                          disabled={retryingKey === `solve-${file.file_id}`}
                        >
                          {retryingKey === `solve-${file.file_id}`
                            ? "Retrying..."
                            : "Retry"}
                        </button>
                      </div>
                    )}

                    {file.solved &&
                      file.ai_solve_status !== "failed" &&
                      !file.ai_summary && (
                        <span className="ai-pending-label">
                          Generating summary & practice...
                        </span>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <button className="post-btn" onClick={goToPost}>
          +
        </button>
      </div>
    </>
  );
}
