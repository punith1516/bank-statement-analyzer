import { format, parseISO } from "date-fns";

import type { TransactionType } from "@/lib/types";

export type TransactionRecord = {
  id?: string;
  date: string; // YYYY-MM-DD
  datetime: string; // ISO-ish
  counterparty: string | null;
  transaction_type: TransactionType;
  debit: number;
  credit: number;
  amount: number;
  utr: string | null;
  transaction_id: string | null;
  narration: string | null;
  account_mask: string | null;
  description?: string | null;
};

export function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

export function computeSummary(transactions: TransactionRecord[]) {
  const totalDebit = sum(transactions.map((t) => Number(t.debit) || 0));
  const totalCredit = sum(transactions.map((t) => Number(t.credit) || 0));
  return {
    totalDebit,
    totalCredit,
    netChange: totalCredit - totalDebit,
  };
}

export function monthlyDebitCredit(transactions: TransactionRecord[]) {
  const map = new Map<string, { month: string; debit: number; credit: number }>();

  for (const t of transactions) {
    const d = safeParseIso(t.datetime);
    const key = d ? format(d, "yyyy-MM") : t.date.slice(0, 7);

    const cur = map.get(key) ?? { month: key, debit: 0, credit: 0 };
    cur.debit += Number(t.debit) || 0;
    cur.credit += Number(t.credit) || 0;
    map.set(key, cur);
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function dailySpendTrend(transactions: TransactionRecord[]) {
  const map = new Map<string, { date: string; spend: number }>();

  for (const t of transactions) {
    const key = t.date;
    const cur = map.get(key) ?? { date: key, spend: 0 };
    cur.spend += Number(t.debit) || 0;
    map.set(key, cur);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function typePie(transactions: TransactionRecord[]) {
  const debit = sum(transactions.map((t) => Number(t.debit) || 0));
  const credit = sum(transactions.map((t) => Number(t.credit) || 0));

  return [
    { name: "Debit", value: debit },
    { name: "Credit", value: credit },
  ];
}

export function topCounterpartyDebit(transactions: TransactionRecord[], limit = 10) {
  const map = new Map<string, number>();

  for (const t of transactions) {
    const spend = Number(t.debit) || 0;
    if (spend <= 0) continue;

    const name = (t.counterparty ?? "Unknown").trim() || "Unknown";
    map.set(name, (map.get(name) ?? 0) + spend);
  }

  return Array.from(map.entries())
    .map(([counterparty, spend]) => ({ counterparty, spend }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

export function safeParseIso(iso: string) {
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}
