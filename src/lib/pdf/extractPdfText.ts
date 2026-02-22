import "server-only";

export type PdfPasswordErrorCode =
  | "PDF_PASSWORD_REQUIRED"
  | "PDF_PASSWORD_INCORRECT"
  | "PDF_PASSWORD_UNSUPPORTED";

export class PdfPasswordError extends Error {
  code: PdfPasswordErrorCode;
  constructor(code: PdfPasswordErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function looksLikeEncryptedPdfError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /password|encrypted/i.test(msg);
}

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  const modUnknown: unknown = await import("pdf-parse");
  const modWithDefault = modUnknown as { default?: unknown };
  const pdfParse =
    typeof modWithDefault.default === "function"
      ? (modWithDefault.default as (data: Buffer) => Promise<{ text?: string }>)
      : (modUnknown as (data: Buffer) => Promise<{ text?: string }>);

  const parsed = await pdfParse(buffer);
  return parsed.text ?? "";
}

export async function extractPdfText(buffer: Buffer, password?: string): Promise<string> {
  // Fast path: most PhonePe PDFs are not encrypted; pdf-parse is lightweight.
  // For encrypted PDFs, we fall back to PDF.js which supports password.
  if (!password) {
    try {
      const text = await extractWithPdfParse(buffer);
      if (text && text.trim().length) return text;
      // If text is empty, fall through to PDF.js (some PDFs extract better there).
    } catch (e) {
      // If the PDF is encrypted, surface a specific error so UI can ask for password.
      if (looksLikeEncryptedPdfError(e)) {
        throw new PdfPasswordError("PDF_PASSWORD_REQUIRED", "PDF is password protected");
      }
      // Otherwise fall through to PDF.js to try again.
    }
  }

  // PDF.js supports encrypted PDFs via password.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      password: password && password.length ? password : undefined,
    });

    const doc = await loadingTask.promise;

    let out = "";
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();

      // Build text while preserving line breaks. Each text item has a
      // transform matrix [a, b, c, d, tx, ty] where ty is the Y position.
      // When ty changes significantly, it indicates a new line.
      let prevY: number | null = null;
      let lineBuffer = "";

      const lines: string[] = [];

      for (const item of content.items) {
        if (typeof item !== "object" || !item || !("str" in item)) continue;
        const ti = item as { str: string; transform?: number[]; hasEOL?: boolean };
        const text = ti.str;

        if (ti.transform && ti.transform.length >= 6) {
          const ty = ti.transform[5];
          // If the Y-position changed (new line), push accumulated line
          if (prevY !== null && Math.abs(ty - prevY) > 2) {
            const trimmed = lineBuffer.trim();
            if (trimmed) lines.push(trimmed);
            lineBuffer = "";
          }
          prevY = ty;
        }

        lineBuffer += text;

        // Some items have an explicit end-of-line flag
        if (ti.hasEOL) {
          const trimmed = lineBuffer.trim();
          if (trimmed) lines.push(trimmed);
          lineBuffer = "";
          prevY = null;
        }
      }

      // Flush remaining buffer
      const remaining = lineBuffer.trim();
      if (remaining) lines.push(remaining);

      const pageText = lines.join("\n").trim();
      if (pageText) out += pageText + "\n";
    }

    return out;
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };

    if (err?.name === "PasswordException") {
      // PDF.js PasswordResponses: 1=NEED_PASSWORD, 2=INCORRECT_PASSWORD
      if (err.code === 1) {
        throw new PdfPasswordError("PDF_PASSWORD_REQUIRED", "PDF is password protected");
      }
      if (err.code === 2) {
        throw new PdfPasswordError("PDF_PASSWORD_INCORRECT", "Incorrect PDF password");
      }
      throw new PdfPasswordError(
        "PDF_PASSWORD_UNSUPPORTED",
        "Password protected PDF could not be opened"
      );
    }

    // Some builds throw plain Error messages for encryption.
    if (looksLikeEncryptedPdfError(e)) {
      throw new PdfPasswordError(
        password ? "PDF_PASSWORD_INCORRECT" : "PDF_PASSWORD_REQUIRED",
        password ? "Incorrect PDF password" : "PDF is password protected"
      );
    }

    throw e;
  }
}
