"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

type ImportResult = {
  extracted_count: number;
  deduped_count: number;
  transactions?: unknown[];
};

function isImportResult(v: unknown): v is ImportResult {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.extracted_count === "number" &&
    typeof obj.deduped_count === "number"
  );
}

function getErrorMessage(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.error === "string") return obj.error;
  if (obj.error && typeof obj.error === "object") {
    const eo = obj.error as Record<string, unknown>;
    if (typeof eo.message === "string") return eo.message;
  }
  return null;
}

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const statusText = useMemo(() => {
    if (isUploading) return "Extracting transactions…";
    if (result) return "Import complete";
    return "";
  }, [isUploading, result]);

  async function importFile(file: File) {
    setError(null);
    setResult(null);
    setIsUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/process-phonepe-pdf", {
        method: "POST",
        body: fd,
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        setError(getErrorMessage(data) ?? "Import failed");
        return;
      }

      if (!isImportResult(data)) {
        setError("Unexpected API response");
        return;
      }

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsUploading(false);
    }
  }

  function onPickClick() {
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void importFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void importFile(file);
  }

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onInputChange}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-2xl border border-dashed p-8 transition-colors ${
          dragOver
            ? "border-zinc-900 bg-zinc-50"
            : "border-zinc-300 bg-white"
        }`}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="text-lg font-semibold text-zinc-900">
            Upload bank / PhonePe PDF statement
          </div>
          <div className="text-sm text-zinc-600">
            Drag & drop a PDF here, or pick a file. Adobe Extract API will process it.
          </div>

          <button
            type="button"
            onClick={onPickClick}
            disabled={isUploading}
            className="mt-2 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isUploading ? "Working…" : "Choose PDF"}
          </button>

          {statusText ? (
            <div className="mt-3 text-sm text-zinc-700">{statusText}</div>
          ) : null}

          {error ? (
            <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="mt-4 w-full rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <div className="font-semibold">Imported</div>
              <div className="mt-1">
                Extracted: <span className="font-semibold">{result.extracted_count}</span>
                {" · "}
                De-duplicated: <span className="font-semibold">{result.deduped_count}</span>
              </div>
              <div className="mt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex rounded-lg bg-emerald-700 px-3 py-1.5 text-white font-semibold"
                >
                  View dashboard
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Notes: Password-protected PDFs are not supported. Adobe Extract API supports up to 100MB.
      </div>
    </div>
  );
}
