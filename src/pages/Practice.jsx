import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../lib/firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import socket from "../lib/socket";
import { gradePracticeAnswer } from "../services/ai-service";
import "../styles/practice.css";
import API_URL from "../config";
import Topbar from "../components/Topbar";

const API_BASE = API_URL;

const DIFFICULTY_LABELS = ["Basic", "Intermediate", "Advanced"];

const DIFFICULTY_TO_LEVEL = {
  Basic: "basic",
  Intermediate: "intermediate",
  Advanced: "advanced",
};

const LEVEL_TO_LABEL = {
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const AI_UNAVAILABLE =
  "AI functionality is currently unavailable, please try again later.";

export default function Practice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get("fileId");
  const levelFromUrl = searchParams.get("level");

  const [difficulty, setDifficulty] = useState(
    LEVEL_TO_LABEL[levelFromUrl] || "Basic",
  );
  const [file, setFile] = useState(null);
  const [practiceResult, setPracticeResult] = useState(null);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [waitingForAi, setWaitingForAi] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState(null);
  const [gradeUnavailable, setGradeUnavailable] = useState(false);
  const [revealedAnswer, setRevealedAnswer] = useState(null);

  const activeLevel = DIFFICULTY_TO_LEVEL[difficulty];

  const currentQuestion = useMemo(() => {
    if (!practiceResult?.questions?.length) {
      return null;
    }

    return (
      practiceResult.questions.find((q) => q.difficulty === activeLevel) || null
    );
  }, [practiceResult, activeLevel]);

  useEffect(() => {
    if (!fileId) {
      setError("Missing fileId in URL.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPracticePage() {
      try {
        setLoading(true);
        setError("");
        setWaitingForAi(false);

        const firebaseUser = await new Promise((resolve) => {
          const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
          });
        });

        if (!firebaseUser) {
          navigate("/login");
          return;
        }

        const fileResponse = await fetch(`${API_BASE}/api/files/${fileId}`);
        const fileData = await fileResponse.json();

        if (!fileResponse.ok) {
          throw new Error(fileData.error || "Failed to load file.");
        }

        if (cancelled) return;

        setFile(fileData);

        if (!fileData.solved) {
          setError(
            "Practice questions are only available for solved resources.",
          );
          return;
        }

        if (!fileData.ai_practice?.questions?.length) {
          if (fileData.ai_solve_status === "failed") {
            setWaitingForAi(false);
            setError(AI_UNAVAILABLE);
            return;
          }
          setWaitingForAi(true);
          setError("");
          return;
        }

        setPracticeResult(fileData.ai_practice);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load practice page:", err);
          setError(err.message || "Failed to load practice questions.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPracticePage();

    return () => {
      cancelled = true;
    };
  }, [fileId, navigate]);

  useEffect(() => {
    if (!fileId) return;

    function handleFileAiUpdated(updatedFile) {
      if (Number(updatedFile.file_id) !== Number(fileId)) {
        return;
      }

      setFile((current) =>
        current ? { ...current, ...updatedFile } : updatedFile,
      );

      if (updatedFile.ai_practice?.questions?.length) {
        setPracticeResult(updatedFile.ai_practice);
        setWaitingForAi(false);
        setError("");
        return;
      }

      if (updatedFile.ai_solve_status === "failed") {
        setWaitingForAi(false);
        setError(AI_UNAVAILABLE);
      }
    }

    socket.on("file-ai-updated", handleFileAiUpdated);
    socket.on("file-solved-updated", handleFileAiUpdated);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off("file-ai-updated", handleFileAiUpdated);
      socket.off("file-solved-updated", handleFileAiUpdated);
    };
  }, [fileId]);

  async function handleLogout() {
    await signOut(auth);
    navigate("/landing");
  }

  async function retrySolveAi() {
    try {
      setRetrying(true);
      setError("");
      setWaitingForAi(true);

      const response = await fetch(`${API_BASE}/api/files/${fileId}/retry-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: "solve" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to retry AI");
      }

      setFile((current) => (current ? { ...current, ...data } : data));

      if (data.ai_practice?.questions?.length) {
        setPracticeResult(data.ai_practice);
        setWaitingForAi(false);
      }
    } catch (err) {
      console.error("Retry AI error:", err);
      setWaitingForAi(false);
      setError(err.message || AI_UNAVAILABLE);
    } finally {
      setRetrying(false);
    }
  }

  function goToProfile() {
    navigate("/profile");
  }

  function resetGradeState() {
    setSubmitted(false);
    setGrading(false);
    setGradeResult(null);
    setGradeUnavailable(false);
    setRevealedAnswer(null);
  }

  function handleDifficultyChange(level) {
    setDifficulty(level);
    setAnswer("");
    resetGradeState();
  }

  async function requestGrade() {
    if (!currentQuestion || !answer.trim()) {
      return;
    }

    setSubmitted(true);
    setGrading(true);
    setGradeResult(null);
    setGradeUnavailable(false);
    setRevealedAnswer(null);

    try {
      const data = await gradePracticeAnswer({
        fileId: Number(fileId),
        difficulty: activeLevel,
        studentAnswer: answer.trim(),
      });

      if (data.aiUnavailable) {
        setGradeUnavailable(true);
        setGradeResult(null);
        setRevealedAnswer({
          model_answer: data.model_answer || currentQuestion.model_answer,
          explanation: data.explanation || currentQuestion.explanation,
        });
        return;
      }

      setGradeUnavailable(false);
      setGradeResult({
        score: data.score,
        feedback: data.feedback,
      });
      setRevealedAnswer({
        model_answer: data.model_answer || currentQuestion.model_answer,
        explanation: data.explanation || currentQuestion.explanation,
      });
    } catch (err) {
      console.error("Grading failed:", err);
      setGradeUnavailable(true);
      setGradeResult(null);
      setRevealedAnswer({
        model_answer: currentQuestion.model_answer,
        explanation: currentQuestion.explanation,
      });
    } finally {
      setGrading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await requestGrade();
  }

  async function handleRetryGrade() {
    await requestGrade();
  }

  if (loading) {
    return <p className="page-message">Loading...</p>;
  }

  if (waitingForAi) {
    return (
      <main className="page-message">
        <p>
          Practice questions are being generated. This page will update
          automatically...
        </p>
        <button type="button" onClick={() => navigate(-1)}>
          Go Back
        </button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-message">
        <p>{error}</p>
        {error === AI_UNAVAILABLE && (
          <button type="button" onClick={retrySolveAi} disabled={retrying}>
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
        <button type="button" onClick={() => navigate(-1)}>
          Go Back
        </button>
      </main>
    );
  }

  return (
    <>
      <Topbar>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </Topbar>

      <div className="page">
        <h1>AI Generated Practice Questions</h1>

        {file && <p className="file-title">{file.title}</p>}

        {practiceResult?.knowledge_point && (
          <p className="knowledge-point">
            Knowledge point: {practiceResult.knowledge_point}
          </p>
        )}

        <div className="status-row">
          <span className={`solved-tag ${file?.solved ? "is-solved" : ""}`}>
            {file?.solved ? "Solved" : "Question Not Solved"}
          </span>
        </div>

        <div className="difficulty">
          {DIFFICULTY_LABELS.map((level) => (
            <button
              key={level}
              type="button"
              className={difficulty === level ? "selected" : ""}
              onClick={() => handleDifficultyChange(level)}
              disabled={grading}
            >
              {level}
            </button>
          ))}
        </div>

        <form className="question" onSubmit={handleSubmit}>
          <h2>Question ({difficulty})</h2>

          {currentQuestion ? (
            <>
              <p className="question-type">
                Type: {currentQuestion.question_type.replace(/_/g, " ")}
              </p>
              <p>{currentQuestion.question_text}</p>
            </>
          ) : (
            <p>No question found for this difficulty level.</p>
          )}

          <textarea
            className="textarea"
            placeholder="Type your answer here..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={!currentQuestion || grading}
          />

          <button
            type="submit"
            className="submit-btn"
            disabled={!currentQuestion || !answer.trim() || grading}
          >
            {grading ? "Grading with AI..." : "Submit Answer"}
          </button>
        </form>

        {submitted && currentQuestion && (
          <div className="ai-feedback">
            {grading && (
              <p className="grading-status">Waiting for AI grading result...</p>
            )}

            {!grading && gradeUnavailable && (
              <div className="ai-unavailable-block">
                <p className="ai-error">{AI_UNAVAILABLE}</p>
                <button
                  type="button"
                  className="ai-retry-btn"
                  onClick={handleRetryGrade}
                  disabled={grading}
                >
                  Get AI Feedback
                </button>
              </div>
            )}

            {!grading && gradeResult && (
              <div className="grade-result">
                <h2>AI Feedback</h2>
                <p className="grade-score">Score: {gradeResult.score} / 10</p>
                <p>{gradeResult.feedback}</p>
              </div>
            )}

            {!grading && revealedAnswer && (
              <div className="revealed-answer">
                <h2>Model Answer</h2>
                <p>{revealedAnswer.model_answer}</p>
                <h3>Explanation</h3>
                <p>{revealedAnswer.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
