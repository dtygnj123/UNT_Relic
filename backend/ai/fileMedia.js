import fs from "fs/promises";
import path from "path";

const TEXT_FILE_PATTERN =
  /\.(txt|md|csv|json|js|jsx|ts|tsx|py|java|sql|html|css|xml|yaml|yml)$/i;

const IMAGE_MIME_PREFIX = "image/";
const PDF_MIME = "application/pdf";

// Keep inline multimodal payloads safely under Gemini inline limits.
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_PARTS = 5;

export function getUploadPathFromUrl(fileUrl) {
  if (!fileUrl) return null;
  const marker = "/uploads/";
  const index = fileUrl.indexOf(marker);
  if (index === -1) return null;
  return path.join("uploads", fileUrl.slice(index + marker.length));
}

function inferMimeType(file) {
  const mime = String(file?.file_type || "").toLowerCase().trim();
  if (mime) return mime;

  const name = String(file?.file_name || "").toLowerCase();
  if (name.endsWith(".pdf")) return PDF_MIME;
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return "application/octet-stream";
}

function isTextLike(file, mime) {
  const fileName = String(file?.file_name || "").toLowerCase();
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    TEXT_FILE_PATTERN.test(fileName)
  );
}

function isPdf(mime, fileName) {
  return mime === PDF_MIME || String(fileName || "").toLowerCase().endsWith(".pdf");
}

function isImage(mime) {
  return mime.startsWith(IMAGE_MIME_PREFIX);
}

/**
 * Load a stored upload for AI use.
 * - Text files → UTF-8 string in `textContent`
 * - PDF/images → base64 multimodal part in `mediaParts`
 */
export async function loadFileForAi(file, { allowMedia = true } = {}) {
  const uploadPath = getUploadPathFromUrl(file?.file_url);
  const fileName = file?.file_name || "unknown";
  const mime = inferMimeType(file);

  const fallbackText = `File name: ${fileName}\nMIME type: ${mime || "unknown"}`;

  if (!uploadPath) {
    return {
      textContent: fallbackText,
      mediaParts: [],
      mediaLabel: null,
    };
  }

  if (isTextLike(file, mime)) {
    try {
      const textContent = await fs.readFile(uploadPath, "utf8");
      return {
        textContent,
        mediaParts: [],
        mediaLabel: null,
      };
    } catch (err) {
      console.error(`Failed to read text file ${uploadPath}:`, err.message);
      return {
        textContent: fallbackText,
        mediaParts: [],
        mediaLabel: null,
      };
    }
  }

  if (!allowMedia || (!isPdf(mime, fileName) && !isImage(mime))) {
    return {
      textContent: fallbackText,
      mediaParts: [],
      mediaLabel: null,
    };
  }

  try {
    const buffer = await fs.readFile(uploadPath);
    if (!buffer.length) {
      return {
        textContent: fallbackText,
        mediaParts: [],
        mediaLabel: null,
      };
    }

    if (buffer.length > MAX_MEDIA_BYTES) {
      return {
        textContent: `${fallbackText}\nNote: file is too large for multimodal AI input (${buffer.length} bytes).`,
        mediaParts: [],
        mediaLabel: null,
      };
    }

    const partType = isPdf(mime, fileName) ? "document" : "image";
    const mediaPart = {
      type: partType,
      data: buffer.toString("base64"),
      mime_type: isPdf(mime, fileName) ? PDF_MIME : mime,
    };

    return {
      textContent:
        "[Attached binary file — carefully read/analyze the attached document or image content. Do not invent topics that are not visible in the attachment.]",
      mediaParts: [mediaPart],
      mediaLabel: `${partType}:${fileName}`,
      byteLength: buffer.length,
    };
  } catch (err) {
    console.error(`Failed to read media file ${uploadPath}:`, err.message);
    return {
      textContent: fallbackText,
      mediaParts: [],
      mediaLabel: null,
    };
  }
}

/**
 * Collect multimodal parts from multiple notes while respecting size caps.
 */
export function collectMediaParts(loadedFiles = []) {
  const mediaParts = [];
  let totalBytes = 0;

  for (const loaded of loadedFiles) {
    if (!loaded?.mediaParts?.length) continue;
    if (mediaParts.length >= MAX_MEDIA_PARTS) break;

    const bytes = loaded.byteLength || 0;
    if (totalBytes + bytes > MAX_TOTAL_MEDIA_BYTES) break;

    mediaParts.push(...loaded.mediaParts);
    totalBytes += bytes;
  }

  return mediaParts;
}

export const MEDIA_LIMITS = {
  MAX_MEDIA_BYTES,
  MAX_TOTAL_MEDIA_BYTES,
  MAX_MEDIA_PARTS,
};
