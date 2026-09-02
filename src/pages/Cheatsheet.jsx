import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase.js";
import socket from "../lib/socket";
import API_URL from "../config";
import "../styles/cheetsheet.css";
import Topbar from "../components/Topbar";

const AI_UNAVAILABLE =
  "AI functionality is currently unavailable, please try again later.";

function courseKey(dept, num) {
  return `${String(dept || "").toUpperCase()}::${String(num || "")}`;
}

function matchesCourse(sheet, dept, num) {
  if (!sheet) return false;
  return (
    String(sheet.course_dept || "").toUpperCase() ===
      String(dept || "").toUpperCase() &&
    String(sheet.course_num || "") === String(num || "")
  );
}

function downloadCheatSheetPdf(content, courseLabel) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 36;
  const marginTop = 36;
  const marginBottom = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = marginTop;

  function ensureSpace(needed) {
    if (y + needed <= pageHeight - marginBottom) return;
    // Prefer fitting on one page: shrink spacing rather than spilling.
    y = Math.min(y, pageHeight - marginBottom - needed);
  }

  function writeWrapped(text, fontSize, style = "normal", gapAfter = 6) {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(String(text || ""), maxWidth);
    const lineHeight = fontSize + 2;
    ensureSpace(lines.length * lineHeight + gapAfter);
    doc.text(lines, marginX, y);
    y += lines.length * lineHeight + gapAfter;
  }

  writeWrapped(content.title || `${courseLabel} Cheat Sheet`, 16, "bold", 10);

  for (const section of content.sections || []) {
    writeWrapped(section.heading || "Section", 11, "bold", 4);
    for (const bullet of section.bullets || []) {
      writeWrapped(`• ${bullet}`, 9, "normal", 2);
    }
    y += 4;
  }

  if (content.formulas?.length) {
    writeWrapped("Formulas", 11, "bold", 4);
    for (const formula of content.formulas) {
      writeWrapped(`• ${formula}`, 9, "normal", 2);
    }
    y += 4;
  }

  if (content.tips?.length) {
    writeWrapped("Exam Tips", 11, "bold", 4);
    for (const tip of content.tips) {
      writeWrapped(`• ${tip}`, 9, "normal", 2);
    }
  }

  const safeName = courseLabel.replace(/\s+/g, "_") || "cheatsheet";
  doc.save(`${safeName}_cheatsheet.pdf`);
}

export default function CheatSheet() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [courses, setCourses] = useState([]);
  const [selectedDept, setSelectedDept] = useState(
    searchParams.get("course_dept") || "",
  );
  const [selectedNum, setSelectedNum] = useState(
    searchParams.get("course_num") || "",
  );
  const [courseFiles, setCourseFiles] = useState([]);
  const [cheatsheet, setCheatsheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  const selectedLabel = useMemo(() => {
    if (!selectedDept || !selectedNum) return "";
    const match = courses.find(
      (c) =>
        courseKey(c.course_dept, c.course_num) ===
        courseKey(selectedDept, selectedNum),
    );
    const name = match?.course_name ? ` — ${match.course_name}` : "";
    return `${selectedDept}${selectedNum}${name}`;
  }, [courses, selectedDept, selectedNum]);

  const content = cheatsheet?.content || null;
  const status = cheatsheet?.ai_status || null;
  const waitingForAi = status === "pending";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${API_URL}/api/cheatsheets/courses`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to load courses.");
        }
        if (cancelled) return;

        setCourses(data);

        const deptFromUrl = searchParams.get("course_dept");
        const numFromUrl = searchParams.get("course_num");
        if (deptFromUrl && numFromUrl) {
          setSelectedDept(deptFromUrl);
          setSelectedNum(numFromUrl);
        } else if (data.length === 1) {
          setSelectedDept(data[0].course_dept);
          setSelectedNum(data[0].course_num);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err.message || "Failed to load courses.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCourses();
    return () => {
      cancelled = true;
    };
    // Only load courses once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (!selectedDept || !selectedNum) {
      setCourseFiles([]);
      setCheatsheet(null);
      return;
    }

    let cancelled = false;

    async function loadCourseData() {
      try {
        setLoadingFiles(true);
        setError("");
        setSearchParams(
          { course_dept: selectedDept, course_num: selectedNum },
          { replace: true },
        );

        const filesResponse = await fetch(
          `${API_URL}/api/files/by-course?course_dept=${encodeURIComponent(selectedDept)}&course_num=${encodeURIComponent(selectedNum)}`,
        );
        const filesData = await filesResponse.json();
        if (!filesResponse.ok) {
          throw new Error(filesData.error || "Failed to load course notes.");
        }
        if (cancelled) return;
        setCourseFiles(filesData.files || []);

        const sheetResponse = await fetch(
          `${API_URL}/api/cheatsheets?course_dept=${encodeURIComponent(selectedDept)}&course_num=${encodeURIComponent(selectedNum)}`,
        );

        if (sheetResponse.status === 404) {
          if (!cancelled) setCheatsheet(null);
          return;
        }

        const sheetData = await sheetResponse.json();
        if (!sheetResponse.ok) {
          throw new Error(sheetData.error || "Failed to load cheat sheet.");
        }
        if (!cancelled) setCheatsheet(sheetData);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err.message || "Failed to load course data.");
        }
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    }

    loadCourseData();
    return () => {
      cancelled = true;
    };
  }, [selectedDept, selectedNum, setSearchParams]);

  useEffect(() => {
    if (!selectedDept || !selectedNum) return;

    function handleCheatsheetUpdated(updated) {
      if (!matchesCourse(updated, selectedDept, selectedNum)) return;
      setCheatsheet(updated);
      setGenerating(false);
      setRetrying(false);
      if (updated.ai_status === "failed") {
        setError(AI_UNAVAILABLE);
      } else if (updated.ai_status === "ready") {
        setError("");
      }
    }

    socket.on("cheatsheet-updated", handleCheatsheetUpdated);
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off("cheatsheet-updated", handleCheatsheetUpdated);
    };
  }, [selectedDept, selectedNum]);

  function handleCourseChange(event) {
    const value = event.target.value;
    if (!value) {
      setSelectedDept("");
      setSelectedNum("");
      return;
    }
    const [dept, num] = value.split("::");
    setSelectedDept(dept);
    setSelectedNum(num);
    setCheatsheet(null);
    setError("");
  }

  async function generateCheatSheet() {
    if (!selectedDept || !selectedNum) return;

    try {
      setGenerating(true);
      setError("");

      const response = await fetch(`${API_URL}/api/cheatsheets/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_dept: selectedDept,
          course_num: selectedNum,
          force: Boolean(content && status === "ready"),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to start cheat sheet generation.");
      }

      setCheatsheet(data);
      if (data.ai_status === "ready" && data.content) {
        setGenerating(false);
      }
    } catch (err) {
      console.error(err);
      setGenerating(false);
      setError(err.message || AI_UNAVAILABLE);
    }
  }

  async function retryCheatSheet() {
    if (!selectedDept || !selectedNum) return;

    try {
      setRetrying(true);
      setError("");

      const response = await fetch(`${API_URL}/api/cheatsheets/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_dept: selectedDept,
          course_num: selectedNum,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to retry cheat sheet generation.");
      }

      setCheatsheet(data);
    } catch (err) {
      console.error(err);
      setRetrying(false);
      setError(err.message || AI_UNAVAILABLE);
    }
  }

  function handleDownloadPdf() {
    if (!content) return;
    downloadCheatSheetPdf(
      content,
      `${selectedDept}${selectedNum}` || "Course",
    );
  }

  async function handleLogout() {
    await signOut(auth);
    navigate("/landing");
  }

  function goToProfile() {
    navigate("/profile");
  }

  if (loading) {
    return <p className="cheatsheet-status">Loading cheat sheet page...</p>;
  }

  return (
    <>
      <Topbar>
          <button className="profile-avatar" onClick={goToProfile}>
            P
          </button>

          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </Topbar>

      <div className="page">
        <h1>AI Course Cheat Sheet</h1>
        <p className="page-subtitle">
          Select a course that already has notes, then generate a one-page cheat
          sheet from those notes.
        </p>

        <div className="cheatsheet-controls">
          <label className="course-select-label" htmlFor="course-select">
            Course
          </label>
          <select
            id="course-select"
            className="course-select"
            value={
              selectedDept && selectedNum
                ? courseKey(selectedDept, selectedNum)
                : ""
            }
            onChange={handleCourseChange}
          >
            <option value="">Select a course with notes</option>
            {courses.map((course) => (
              <option
                key={courseKey(course.course_dept, course.course_num)}
                value={courseKey(course.course_dept, course.course_num)}
              >
                {course.course_dept}
                {course.course_num}
                {course.course_name &&
                course.course_name !==
                  `${course.course_dept}${course.course_num}`
                  ? ` — ${course.course_name}`
                  : course.sample_titles?.[0]
                    ? ` — ${course.sample_titles[0]}`
                    : ""}{" "}
                ({course.file_count} notes)
              </option>
            ))}
          </select>

          <div className="cheatsheet-actions">
            <button
              className="generate-btn"
              onClick={generateCheatSheet}
              disabled={
                !selectedDept ||
                !selectedNum ||
                !courseFiles.length ||
                generating ||
                waitingForAi ||
                retrying
              }
            >
              {waitingForAi || generating
                ? "Generating..."
                : content
                  ? "Regenerate Cheat Sheet"
                  : "Generate Cheat Sheet"}
            </button>

            {content && status === "ready" && (
              <button className="download-btn" onClick={handleDownloadPdf}>
                Download PDF
              </button>
            )}

            {status === "failed" && (
              <button
                className="retry-btn"
                onClick={retryCheatSheet}
                disabled={retrying || waitingForAi}
              >
                {retrying ? "Retrying..." : "Retry"}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="cheatsheet-error">
            <p>{error}</p>
            {status === "failed" && (
              <button
                className="retry-btn"
                onClick={retryCheatSheet}
                disabled={retrying}
              >
                {retrying ? "Retrying..." : "Retry AI"}
              </button>
            )}
          </div>
        )}

        {selectedDept && selectedNum && (
          <section className="source-notes">
            <h2>Source notes for {selectedLabel}</h2>
            {loadingFiles ? (
              <p>Loading notes...</p>
            ) : courseFiles.length === 0 ? (
              <p>No notes found for this course.</p>
            ) : (
              <ul>
                {courseFiles.map((file) => (
                  <li key={file.file_id}>
                    <strong>{file.title}</strong>
                    {file.ai_preview ? ` — ${file.ai_preview}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {(waitingForAi || generating) && (
          <p className="cheatsheet-status">
            AI is generating your one-page cheat sheet. This page will update
            automatically when ready.
          </p>
        )}

        {content && status === "ready" && (
          <div className="sheet">
            <h2>{content.title || `${selectedDept}${selectedNum} Cheat Sheet`}</h2>
            <hr />

            {(content.sections || []).map((section) => (
              <div key={section.heading} className="sheet-section">
                <h3>{section.heading}</h3>
                <ul>
                  {(section.bullets || []).map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}

            {content.formulas?.length > 0 && (
              <div className="sheet-section">
                <h3>Formulas</h3>
                <ul>
                  {content.formulas.map((formula) => (
                    <li key={formula}>{formula}</li>
                  ))}
                </ul>
              </div>
            )}

            {content.tips?.length > 0 && (
              <div className="sheet-section">
                <h3>Exam Tips</h3>
                <ul>
                  {content.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!content &&
          !waitingForAi &&
          !generating &&
          selectedDept &&
          selectedNum &&
          courseFiles.length > 0 &&
          status !== "failed" && (
            <p className="cheatsheet-status">
              No cheat sheet yet for this course. Click Generate to create one
              from the notes above.
            </p>
          )}

        {!courses.length && (
          <p className="cheatsheet-status">
            No courses with notes yet. Upload study files in the gallery first.
          </p>
        )}
      </div>
    </>
  );
}
