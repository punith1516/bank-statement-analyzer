"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AddTransactionForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("00:00");
  const [transactionType, setTransactionType] = useState<"Debit" | "Credit">("Debit");
  const [amount, setAmount] = useState(0);
  const [counterparty, setCounterparty] = useState("");
  const [narration, setNarration] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => amount > 0 && date.length > 0, [amount, date]);

  function extractErrorMessage(v: unknown): string | null {
    if (!v || typeof v !== "object") return null;
    const obj = v as Record<string, unknown>;
    const err = obj.error;
    if (!err || typeof err !== "object") return null;
    const eo = err as Record<string, unknown>;
    return typeof eo.message === "string" ? eo.message : null;
  }

  async function submit() {
    setError(null);

    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        time,
        transaction_type: transactionType,
        amount,
        counterparty: counterparty.length ? counterparty : null,
        narration: narration.length ? narration : null,
        description: description.length ? description : null,
      }),
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = extractErrorMessage(data) ?? "Create failed";
      setError(msg);
      return;
    }

    setAmount(0);
    setCounterparty("");
    setNarration("");
    setDescription("");

    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-900">Add manual transaction</div>
        <div className="text-xs text-zinc-500">No auth enabled</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold text-zinc-500">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2"
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold text-zinc-500">Time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2"
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold text-zinc-500">Type</span>
          <select
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value as "Debit" | "Credit")}
            className="rounded-xl border border-zinc-200 px-3 py-2"
            disabled={isPending}
          >
            <option value="Debit">Debit</option>
            <option value="Credit">Credit</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-semibold text-zinc-500">Amount (INR)</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="rounded-xl border border-zinc-200 px-3 py-2"
            min={0}
            step={1}
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-xs font-semibold text-zinc-500">Counterparty</span>
          <input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2"
            placeholder="e.g. HEMA K / ******1419"
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-xs font-semibold text-zinc-500">Narration</span>
          <input
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2"
            placeholder="Optional"
            disabled={isPending}
          />
        </label>

        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-xs font-semibold text-zinc-500">Description (your note)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2"
            placeholder="e.g. Dinner with friends"
            disabled={isPending}
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || isPending}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Add transaction
        </button>
      </div>
    </div>
  );
}
