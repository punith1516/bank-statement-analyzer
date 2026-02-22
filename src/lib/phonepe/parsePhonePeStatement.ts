import { format, isValid, parse as parseDate } from "date-fns";

import type { ParsedTransaction, TransactionType } from "@/lib/types";

const monthDayYearRegex = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}$/i;
const time12hRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

function normalizeText(text: string) {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v]/g, " ");
}

function compactSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function parseAmountFromLine(line: string): number | null {
  const m = line.match(/\bINR\s*([0-9,]+(?:\.[0-9]{2})?)\b/i);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function parseDateToIso(dateLine: string): string | null {
  const candidate = dateLine.trim();
  let d = parseDate(candidate, "MMM d, yyyy", new Date());
  if (!isValid(d)) d = parseDate(candidate, "MMMM d, yyyy", new Date());
  if (!isValid(d)) return null;
  return format(d, "yyyy-MM-dd");
}

function timeTo24h(time: string | null): { timeText: string; hhmm: string } {
  if (!time) return { timeText: "00:00", hhmm: "00:00" };
  const m = time.trim().match(time12hRegex);
  if (!m) {
    const cleaned = compactSpaces(time);
    if (/^\d{2}:\d{2}$/.test(cleaned)) return { timeText: cleaned, hhmm: cleaned };
    return { timeText: "00:00", hhmm: "00:00" };
  }

  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const ampm = m[3].toUpperCase();

  if (hours === 12) hours = 0;
  if (ampm === "PM") hours += 12;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return { timeText: `${m[1].padStart(2, "0")}:${mm} ${ampm}`, hhmm: `${hh}:${mm}` };
}

function isAnchorLine(line: string) {
  const l = line.trim();
  if (!l) return true;
  if (monthDayYearRegex.test(l)) return true;
  if (time12hRegex.test(l)) return true;
  if (/^(Debit|Credit)$/i.test(l)) return true;
  if (/\bTransaction\s*ID\b/i.test(l)) return true;
  if (/\bUTR\s*No\b/i.test(l)) return true;
  if (/\bDebited\s+from\b/i.test(l)) return true;
  if (/\bCredited\s+to\b/i.test(l)) return true;
  if (/\bINR\b/i.test(l)) return true;
  return false;
}

function readMultiLineValue(lines: string[], startIndex: number, initialValue: string) {
  const parts: string[] = [];
  if (initialValue) parts.push(initialValue);

  for (let i = startIndex + 1; i < lines.length; i++) {
    const candidate = compactSpaces(lines[i]);
    if (!candidate) continue;
    if (isAnchorLine(candidate)) break;
    parts.push(candidate);
  }

  return compactSpaces(parts.join(" "));
}

function inferTypeFromNarration(narration: string): TransactionType | null {
  const n = narration.toLowerCase();
  if (n.includes("paid to")) return "Debit";
  if (n.includes("received from")) return "Credit";
  return null;
}

export function extractPhonePeTransactionsFromText(text: string): ParsedTransaction[] {
  const normalized = normalizeText(text);
  const rawLines = normalized.split("\n");
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

  const startIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!monthDayYearRegex.test(lines[i])) continue;

    // Heuristic: within next few lines we should see a transaction anchor
    const lookahead = lines.slice(i, i + 12).join("\n");
    if (!/(Paid to|Received from|Transaction ID|UTR No|Debit|Credit|INR)/i.test(lookahead)) continue;
    startIndices.push(i);
  }

  const blocks: string[][] = [];
  for (let i = 0; i < startIndices.length; i++) {
    const start = startIndices[i];
    const end = i + 1 < startIndices.length ? startIndices[i + 1] : lines.length;
    blocks.push(lines.slice(start, end));
  }

  const parsed: ParsedTransaction[] = [];

  for (const block of blocks) {
    const dateIso = parseDateToIso(block[0]);
    if (!dateIso) continue;

    let timeLine: string | null = null;
    if (block.length > 1 && time12hRegex.test(block[1])) timeLine = block[1];
    else {
      const t = block.find((l) => time12hRegex.test(l));
      if (t) timeLine = t;
    }

    const { timeText, hhmm } = timeTo24h(timeLine);
    const datetime = `${dateIso}T${hhmm}:00`;

    const transactionIdMatch = block.join("\n").match(/\bTransaction\s*ID\s*:\s*([^\s\n]+)/i);
    const utrMatch = block.join("\n").match(/\bUTR\s*No\s*:\s*([^\s\n]+)/i);

    const accountMatch = block
      .join("\n")
      .match(/\b(?:Debited\s+from|Credited\s+to)\s+([^\n\r]+)/i);

    const accountMask = accountMatch ? compactSpaces(accountMatch[1]).split(" ")[0] : "";

    let explicitType: TransactionType | null = null;
    for (const l of block) {
      const m = l.match(/^(Debit|Credit)$/i);
      if (m) {
        explicitType = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        break;
      }
    }

    // Counterparty & narration
    let counterparty = "";
    for (let i = 0; i < block.length; i++) {
      const paid = block[i].match(/^Paid\s+to\s+(.+)$/i);
      const received = block[i].match(/^Received\s+from\s+(.+)$/i);
      if (paid) {
        counterparty = readMultiLineValue(block, i, paid[1]);
        break;
      }
      if (received) {
        counterparty = readMultiLineValue(block, i, received[1]);
        break;
      }
    }

    const narration = block
      .filter((l) => !monthDayYearRegex.test(l))
      .filter((l) => !time12hRegex.test(l))
      .filter((l) => !/^(Debit|Credit)$/i.test(l))
      .join("\n")
      .trim();

    const inferredType = inferTypeFromNarration(narration);
    const transaction_type = (explicitType ?? inferredType) as TransactionType | null;
    if (!transaction_type) continue;

    // Amount: prefer the last INR occurrence in the block
    let amount: number | null = null;
    for (let i = block.length - 1; i >= 0; i--) {
      const a = parseAmountFromLine(block[i]);
      if (a !== null) {
        amount = a;
        break;
      }
    }
    if (amount === null) continue;

    const tx: ParsedTransaction = {
      date: dateIso,
      time: timeLine ? timeText : "00:00",
      datetime,
      description: narration || counterparty || "Transaction",
      counterparty: counterparty || "Unknown",
      narration: narration || "",
      transaction_type,
      amount,
      utr: utrMatch?.[1] ?? "",
      transaction_id: transactionIdMatch?.[1] ?? "",
      account_mask: accountMask,
    };

    parsed.push(tx);
  }

  // De-dup: prefer UTR, fallback to (transaction_id|datetime|amount)
  const seen = new Set<string>();
  const deduped: ParsedTransaction[] = [];

  for (const t of parsed) {
    const key = t.utr
      ? `utr:${t.utr}`
      : `fallback:${t.transaction_id || "na"}|${t.datetime}|${t.amount}`;

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }

  return deduped;
}
