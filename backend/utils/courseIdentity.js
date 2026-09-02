/**
 * Resolve a stable course identity for cheat-sheet grouping.
 * Prefers explicit course_dept/course_num, then infers from title/course_name
 * (e.g. "Csc343", "CSCC43", "CSC209 lecture").
 */

function cleanCourseName(name, dept, num) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return `${dept}${num}`;

  const normalized = trimmed.replace(/\s+/g, " ").toUpperCase();
  const code = `${dept}${num}`.toUpperCase();
  const spaced = `${dept} ${num}`.toUpperCase();

  // Uploads often stored course_name as "CS 300" or " 300".
  if (
    normalized === code ||
    normalized === spaced ||
    normalized === String(num).toUpperCase() ||
    /^\d{2,3}[A-Z]?$/.test(normalized)
  ) {
    return `${dept}${num}`;
  }

  return trimmed;
}

export function inferCourseFromText(text) {
  const upper = String(text || "").toUpperCase();
  if (!upper.trim()) return null;

  // UTSC-style: CSCA08, CSCB07, CSCC43, CSCD01
  let match = upper.match(/\b([A-Z]{3})([A-D]\d{2})\b/);
  if (match) {
    return {
      course_dept: match[1],
      course_num: match[2],
      course_name: `${match[1]}${match[2]}`,
    };
  }

  // Common UofT style: CSC343, MAT235, STA257, CSCC09 (3–4 letters + 3 digits)
  match = upper.match(/\b([A-Z]{2,4})\s*[-\s]?\s*(\d{3}[A-Z]?)\b/);
  if (match) {
    return {
      course_dept: match[1],
      course_num: match[2],
      course_name: `${match[1]}${match[2]}`,
    };
  }

  return null;
}

export function resolveCourseIdentity(file) {
  const dept = String(file?.course_dept || "").trim().toUpperCase();
  const num = String(file?.course_num || "").trim().toUpperCase();

  if (dept && num) {
    return {
      course_dept: dept,
      course_num: num,
      course_name: cleanCourseName(file?.course_name, dept, num),
      source: "fields",
    };
  }

  const inferred = inferCourseFromText(
    `${file?.title || ""} ${file?.course_name || ""} ${file?.description || ""}`,
  );
  if (inferred) {
    return {
      course_dept: inferred.course_dept,
      course_num: inferred.course_num,
      course_name: cleanCourseName(
        file?.course_name || inferred.course_name,
        inferred.course_dept,
        inferred.course_num,
      ),
      source: "inferred",
    };
  }

  // Legacy uploads: level only (e.g. course_num=300, empty dept).
  if (num) {
    return {
      course_dept: "UNKNOWN",
      course_num: num,
      course_name: cleanCourseName(file?.course_name || file?.title, "UNKNOWN", num),
      source: "level-only",
    };
  }

  return null;
}

export function courseKey(dept, num) {
  return `${String(dept || "").trim().toUpperCase()}::${String(num || "").trim().toUpperCase()}`;
}

export function matchesCourse(file, courseDept, courseNum) {
  const identity = resolveCourseIdentity(file);
  if (!identity) return false;

  return (
    identity.course_dept === String(courseDept || "").trim().toUpperCase() &&
    identity.course_num === String(courseNum || "").trim().toUpperCase()
  );
}

export function aggregateCourses(files = []) {
  const byKey = new Map();

  for (const file of files) {
    const identity = resolveCourseIdentity(file);
    if (!identity) continue;

    const key = courseKey(identity.course_dept, identity.course_num);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        course_dept: identity.course_dept,
        course_num: identity.course_num,
        course_name: identity.course_name,
        file_count: 1,
        sample_titles: file.title ? [file.title] : [],
      });
      continue;
    }

    existing.file_count += 1;
    if (
      identity.course_name &&
      identity.course_name !== `${identity.course_dept}${identity.course_num}` &&
      existing.course_name === `${identity.course_dept}${identity.course_num}`
    ) {
      existing.course_name = identity.course_name;
    }
    if (file.title && existing.sample_titles.length < 3) {
      existing.sample_titles.push(file.title);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const deptCmp = a.course_dept.localeCompare(b.course_dept);
    if (deptCmp !== 0) return deptCmp;
    return a.course_num.localeCompare(b.course_num);
  });
}
