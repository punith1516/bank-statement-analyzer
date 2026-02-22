"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  id: string;
  initialDescription: string | null;
};

export default function DescriptionEditor({ id, initialDescription }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialDescription ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: value.length ? value : null }),
    });

    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null);
      const msg = extractErrorMessage(data) ?? "Update failed";
      setError(msg);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add description…"
          className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm"
          disabled={isPending}
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          Save
        </button>
      </div>
      {error ? <div className="mt-1 text-xs text-red-700">{error}</div> : null}
    </div>
  );
}

function extractErrorMessage(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const err = obj.error;
  if (!err || typeof err !== "object") return null;
  const eo = err as Record<string, unknown>;
  return typeof eo.message === "string" ? eo.message : null;
}
