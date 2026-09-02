import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import "../styles/comment.css";
import socket from "../lib/socket";
import API_URL from "../config";
import Topbar from "../components/Topbar";

export default function Comments() {
  const navigate = useNavigate();
  const { fileId } = useParams();

  const [file, setFile] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");

  const [loading, setLoading] = useState(true);
  const [postingComment, setPostingComment] = useState(false);
  const [error, setError] = useState("");
  const [retryingJob, setRetryingJob] = useState("");

  const [user, setUser] = useState(null);

  const AI_UNAVAILABLE =
    "AI functionality is currently unavailable, please try again later.";

  // 1. Load file and comments when the component mounts or when fileId changes
  useEffect(() => {
    loadPage();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        return;
      }

      try {
        // Load the user's profile.
        const userResponse = await fetch(
          `${API_URL}/api/users/${currentUser.uid}`,
        );

        const userData = await userResponse.json();

        if (!userResponse.ok) {
          throw new Error(userData.error || "Failed to load user");
        }

        setUser(userData);

        // Record this file as recently viewed.
        const viewResponse = await fetch(
          `${API_URL}/api/files/${fileId}/view`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: currentUser.uid,
            }),
          },
        );

        const viewData = await viewResponse.json();

        if (!viewResponse.ok) {
          throw new Error(viewData.error || "Failed to record file view");
        }

        console.log("Recent files:", viewData.recentFileIds);
      } catch (err) {
        console.error("Failed to load user or record view:", err);
      }
    });

    return unsubscribe;
  }, [fileId]);

  // Function to load the file and its comments
  async function loadPage() {
    try {
      setLoading(true);
      setError("");

      // Fetch file and comments in parallel
      const [fileResponse, commentsResponse] = await Promise.all([
        // Fetch the file details from the backend
        fetch(`${API_URL}/api/files/${fileId}`),

        // Fetch the comments for the file from the backend
        fetch(`${API_URL}/api/files/${fileId}/comments`),
      ]);

      // Parse the JSON responses
      const fileData = await fileResponse.json();
      const commentsData = await commentsResponse.json();

      if (!fileResponse.ok) {
        throw new Error(fileData.error || "Failed to load file");
      }

      if (!commentsResponse.ok) {
        throw new Error(commentsData.error || "Failed to load comments");
      }

      setFile(fileData);
      setComments(commentsData);
    } catch (err) {
      console.error("Failed to load comment page:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // 2. Listen for Socket.IO events
  useEffect(() => {
    function handleConnect() {
      console.log("Comment socket connected:", socket.id);
    }

    function handleConnectError(err) {
      console.error("Comment socket connection failed:", err.message);
    }

    // Handle new comment creation event
    function handleCommentCreated(newComment) {
      console.log("Received comment-created:", newComment);

      // Only update comments if the new comment belongs to the current file
      if (Number(newComment.file_id) !== Number(fileId)) {
        return;
      }

      // Update the comments state with the new comment, ensuring no duplicates
      setComments((currentComments) => {
        const alreadyExists = currentComments.some(
          (comment) =>
            Number(comment.comment_id) === Number(newComment.comment_id),
        );

        if (alreadyExists) {
          return currentComments;
        }

        return [newComment, ...currentComments];
      });
    }

    // Handle comment rating update event
    function handleCommentRatingUpdated(updatedComment) {
      console.log("Received comment-rating-updated:", updatedComment);

      if (Number(updatedComment.file_id) !== Number(fileId)) {
        return;
      }

      setComments((currentComments) =>
        currentComments.map((comment) =>
          Number(comment.comment_id) === Number(updatedComment.comment_id)
            ? {
                ...comment,
                rating_positive: updatedComment.rating_positive,
                rating_negative: updatedComment.rating_negative,
              }
            : comment,
        ),
      );
    }

    function handleFileAiUpdated(updatedFile) {
      if (Number(updatedFile.file_id) !== Number(fileId)) {
        return;
      }

      setFile((current) =>
        current ? { ...current, ...updatedFile } : updatedFile,
      );
    }

    function handleFileSolvedUpdated(updatedFile) {
      if (Number(updatedFile.file_id) !== Number(fileId)) {
        return;
      }

      setFile((current) =>
        current ? { ...current, ...updatedFile } : updatedFile,
      );
    }

    // Set up Socket.IO event listeners
    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("comment-created", handleCommentCreated);
    socket.on("comment-rating-updated", handleCommentRatingUpdated);
    socket.on("file-ai-updated", handleFileAiUpdated);
    socket.on("file-solved-updated", handleFileSolvedUpdated);

    if (!socket.connected) {
      socket.connect();
    }

    // Clean up Socket.IO event listeners when the component unmounts
    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("comment-created", handleCommentCreated);
      socket.off("comment-rating-updated", handleCommentRatingUpdated);
      socket.off("file-ai-updated", handleFileAiUpdated);
      socket.off("file-solved-updated", handleFileSolvedUpdated);
    };
  }, [fileId]);

  // Functions to handle comment posting and rating updates
  async function loadComments() {
    try {
      // Fetch the latest comments for the file from the backend
      const response = await fetch(`${API_URL}/api/files/${fileId}/comments`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load comments");
      }

      setComments(data);
    } catch (err) {
      console.error("Failed to refresh comments:", err);
      setError(err.message);
    }
  }

  async function retryAi(job) {
    try {
      setRetryingJob(job);
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

      setFile((current) => (current ? { ...current, ...data } : data));
    } catch (err) {
      console.error("Retry AI error:", err);
      setError(err.message);
    } finally {
      setRetryingJob("");
    }
  }

  // Function to handle posting a new comment
  async function handlePostComment(event) {
    event.preventDefault();

    const content = newComment.trim();

    if (!content) {
      setError("Please enter a comment.");
      return;
    }

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      navigate("/login");
      return;
    }

    try {
      setPostingComment(true);
      setError("");

      // Send a POST request to the backend to create a new comment
      const response = await fetch(`${API_URL}/api/files/${fileId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: firebaseUser.uid,
          content,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to post comment");
      }

      setNewComment("");
    } catch (err) {
      console.error("Failed to post comment:", err);
      setError(err.message);
    } finally {
      setPostingComment(false);
    }
  }

  // 3. Handle file and comment rating updates
  async function handleFileLike() {
    try {
      setError("");

      const response = await fetch(`${API_URL}/api/files/${fileId}/like`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to like file");
      }

      setFile((currentFile) => ({
        ...currentFile,
        rating_positive: data.rating_positive,
        rating_negative: data.rating_negative,
      }));
    } catch (err) {
      console.error("Failed to like file:", err);
      setError(err.message);
    }
  }

  async function handleFileDislike() {
    try {
      setError("");

      // Send a PATCH request to the backend to dislike the file
      const response = await fetch(`${API_URL}/api/files/${fileId}/dislike`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to dislike file");
      }

      setFile((currentFile) => ({
        ...currentFile,
        rating_positive: data.rating_positive,
        rating_negative: data.rating_negative,
      }));
    } catch (err) {
      console.error("Failed to dislike file:", err);
      setError(err.message);
    }
  }

  // Handle comment like and dislike actions
  async function handleCommentLike(commentId) {
    try {
      setError("");

      // Send a PATCH request to the backend to like the comment
      const response = await fetch(
        `${API_URL}/api/files/${fileId}/comments/${commentId}/like`,
        {
          method: "PATCH",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to like comment");
      }

      updateCommentRating(data);
    } catch (err) {
      console.error("Failed to like comment:", err);
      setError(err.message);
    }
  }

  // Handle comment dislike action
  async function handleCommentDislike(commentId) {
    try {
      setError("");

      const response = await fetch(
        `${API_URL}/api/files/${fileId}/comments/${commentId}/dislike`,
        {
          method: "PATCH",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to dislike comment");
      }

      updateCommentRating(data);
    } catch (err) {
      console.error("Failed to dislike comment:", err);
      setError(err.message);
    }
  }

  // Update the comment rating in the local state
  function updateCommentRating(updatedComment) {
    // Update the comments state with the new rating values for the specific comment
    setComments((currentComments) =>
      currentComments.map((comment) => {
        if (comment.comment_id !== updatedComment.comment_id) {
          return comment;
        }

        // Update the comment's rating values with the new data from the backend
        return {
          // Spread the existing comment properties and update the rating values
          ...comment,
          // Update the positive and negative rating values with the new data
          rating_positive: updatedComment.rating_positive,
          rating_negative: updatedComment.rating_negative,
        };
      }),
    );
  }

  // 4. Navigation and utility functions
  async function handleLogout() {
    try {
      // Sign out the user from Firebase Authentication
      await signOut(auth);
      navigate("/landing");
    } catch (err) {
      console.error("Failed to log out:", err);
      setError("Failed to log out.");
    }
  }

  function goToProfile() {
    navigate("/profile");
  }

  function goToCheatSheet() {
    const dept = String(file?.course_dept || "").trim();
    const num = String(file?.course_num || "").trim();

    if (dept && num) {
      navigate(
        `/cheatsheet?course_dept=${encodeURIComponent(dept)}&course_num=${encodeURIComponent(num)}`,
      );
      return;
    }

    const title = String(file?.title || "").toUpperCase();
    const utsc = title.match(/\b([A-Z]{3})([A-D]\d{2})\b/);
    const stg = title.match(/\b([A-Z]{2,4})\s*[-\s]?\s*(\d{3}[A-Z]?)\b/);
    const inferredDept = utsc?.[1] || stg?.[1];
    const inferredNum = utsc?.[2] || stg?.[2];

    if (inferredDept && inferredNum) {
      navigate(
        `/cheatsheet?course_dept=${encodeURIComponent(inferredDept)}&course_num=${encodeURIComponent(inferredNum)}`,
      );
      return;
    }

    navigate("/cheatsheet");
  }

  function goToPractice(level) {
    navigate(`/practice?fileId=${fileId}&level=${level}`);
  }

  function handleDownload() {
    if (!file?.file_url) {
      setError("No file URL is available.");
      return;
    }

    window.open(file.file_url, "_blank", "noopener,noreferrer");
  }

  function formatDate(date) {
    if (!date) {
      return "";
    }

    return new Date(date).toLocaleString();
  }

  function renderFile() {
    if (!file?.file_url) {
      return <p>No uploaded file URL is available.</p>;
    }

    const fileType = (file.file_type || "").toLowerCase();
    const fileName = (file.file_name || "").toLowerCase();

    const isImage =
      fileType.startsWith("image/") ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName);

    const isPdf = fileType === "application/pdf" || fileName.endsWith(".pdf");

    const isText = fileType.startsWith("text/") || fileName.endsWith(".txt");

    if (isImage) {
      return (
        <img
          className="uploaded-image"
          src={file.file_url}
          alt={file.title}
          onError={() => {
            setError("The uploaded image could not be loaded.");
          }}
        />
      );
    }

    if (isPdf) {
      return (
        <object
          className="uploaded-file-frame"
          data={file.file_url}
          type="application/pdf"
        >
          <p>Your browser could not display this PDF.</p>

          <button onClick={handleDownload}>Open PDF</button>
        </object>
      );
    }

    if (isText) {
      return (
        <iframe
          className="uploaded-file-frame"
          src={file.file_url}
          title={file.title}
        />
      );
    }

    return (
      <div className="unsupported-preview">
        <p>This file type cannot be displayed directly in the browser.</p>

        <p>
          <strong>File:</strong> {file.file_name}
        </p>

        <p>
          <strong>Type:</strong> {file.file_type || "Unknown"}
        </p>

        <button className="download-btn" onClick={handleDownload}>
          Open File
        </button>
      </div>
    );
  }

  if (loading) {
    return <p className="page-message">Loading file...</p>;
  }

  if (!file) {
    return (
      <main className="page-message">
        <p>{error || "File not found."}</p>

        <button onClick={() => navigate(-1)}>Back to Gallery</button>
      </main>
    );
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

      <main className="detail-page">
        <section className="file-preview">
          <h2>{file.title}</h2>

          <div className="file-details">
            <p>
              <strong>Posted by:</strong> {file.user_name || "Unknown user"}
            </p>

            <p>
              <strong>Course:</strong>{" "}
              {file.course_dept && file.course_num
                ? `${file.course_dept}${file.course_num}`
                : "Not specified"}
            </p>

            <p>
              <strong>Uploaded:</strong> {formatDate(file.uploaded_at)}
            </p>

            <p>
              <strong>Description:</strong>{" "}
              {file.description || "No description"}
            </p>
          </div>

          <div className="real-file-preview">{renderFile()}</div>

          <button className="download-btn" onClick={handleDownload}>
            Download File
          </button>
        </section>

        <aside className="side-panel">
          <div className="info-card">
            <h3>AI Preview</h3>

            {file.ai_upload_status === "failed" ? (
              <div className="ai-error-block">
                <p className="ai-error">{AI_UNAVAILABLE}</p>
                <button
                  type="button"
                  className="ai-retry-btn"
                  onClick={() => retryAi("upload")}
                  disabled={retryingJob === "upload"}
                >
                  {retryingJob === "upload" ? "Retrying..." : "Retry"}
                </button>
              </div>
            ) : (
              <>
                {file.ai_preview ? (
                  <p>{file.ai_preview}</p>
                ) : (
                  <p className="ai-pending">AI preview generating...</p>
                )}

                <div className="tags">
                  {file.ai_tags?.length > 0 ? (
                    file.ai_tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="ai-pending">AI tags generating...</span>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="info-card">
            <h3>Rating</h3>

            <div className="rating-row">
              <button className="rate-btn up" onClick={handleFileLike}>
                + {file.rating_positive || 0}
              </button>

              <button className="rate-btn down" onClick={handleFileDislike}>
                - {file.rating_negative || 0}
              </button>
            </div>
          </div>

          <div className="info-card">
            <h3>AI Summary Answer</h3>

            {file.ai_solve_status === "failed" ? (
              <div className="ai-error-block">
                <p className="ai-error">{AI_UNAVAILABLE}</p>
                <button
                  type="button"
                  className="ai-retry-btn"
                  onClick={() => retryAi("solve")}
                  disabled={retryingJob === "solve"}
                >
                  {retryingJob === "solve" ? "Retrying..." : "Retry"}
                </button>
              </div>
            ) : (
              <p>
                {file.ai_summary
                  ? file.ai_summary
                  : file.solved
                    ? "AI summary generating..."
                    : "Mark this resource as solved to generate an AI summary."}
              </p>
            )}
          </div>

          <div className="info-card premium-card">
            <h3>Practice Questions</h3>

            <p>Premium feature. Subscription required.</p>

            <button
              className="practice-btn"
              onClick={() => goToPractice("basic")}
            >
              Basic Questions
            </button>

            <button
              className="practice-btn"
              onClick={() => goToPractice("intermediate")}
            >
              Intermediate Questions
            </button>

            <button
              className="practice-btn"
              onClick={() => goToPractice("advanced")}
            >
              Advanced Questions
            </button>
          </div>

          <div className="info-card">
            <h3>Cheat Sheet</h3>

            <button className="cheat-btn" onClick={goToCheatSheet}>
              Generate Cheat Sheet
            </button>
          </div>

          <section className="comments-section">
            <h3>Comments</h3>

            <form className="comment-form" onSubmit={handlePostComment}>
              <textarea
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                placeholder="Write a comment..."
                maxLength={1000}
              />

              <button type="submit" disabled={postingComment}>
                {postingComment ? "Posting..." : "Post Comment"}
              </button>
            </form>

            {error && <p className="error-message">{error}</p>}

            {comments.length === 0 ? (
              <p>No comments yet.</p>
            ) : (
              comments.map((comment) => (
                <article className="comment-card" key={comment.comment_id}>
                  <div className="comment-header">
                    <strong>{comment.user_name || "Unknown user"}</strong>

                    <span>{formatDate(comment.created_at)}</span>
                  </div>

                  <p>{comment.content}</p>

                  <div className="comment-actions">
                    <button
                      onClick={() => handleCommentLike(comment.comment_id)}
                    >
                      + {comment.rating_positive || 0}
                    </button>

                    <button
                      onClick={() => handleCommentDislike(comment.comment_id)}
                    >
                      - {comment.rating_negative || 0}
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        </aside>
      </main>
    </>
  );
}
