import { format, isValid, parse as parseDate } from "date-fns";

import type { AdobeStructuredData, ParsedTransaction } from "@/lib/types";

function normalizeAmount(val: string): number | null {
  // Remove currency symbols, commas, spaces
  const cleaned = val.replace(/[₹,\s]/g, "").trim();

  // Handle parentheses as negative (e.g., (100) = -100)
  const isNegative = /^\(.*\)$/.test(cleaned);
  const num = Number(cleaned.replace(/[()]/g, ""));

  if (!Number.isFinite(num)) return null;
  return isNegative ? -num : num;
}

function parseFlexibleDate(val: string): string | null {
  const trimmed = val.trim();

  // Try common formats
  const formats = [
    "dd/MM/yyyy",
    "dd-MM-yyyy",
    "yyyy-MM-dd",
    "MM/dd/yyyy",
    "dd MMM yyyy",
    "dd MMMM yyyy",
    "MMM dd, yyyy",
    "MMMM dd, yyyy",
  ];

  for (const fmt of formats) {
    const d = parseDate(trimmed, fmt, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }

  return null;
}

function inferTypeFromAmount(debit: number | null, credit: number | null): "Debit" | "Credit" {
  if (debit !== null && debit > 0) return "Debit";
  if (credit !== null && credit > 0) return "Credit";
  return "Debit"; // default
}

function cellToString(cell: { content?: string } | undefined): string {
  return (cell?.content ?? "").trim();
}

export function parseTransactionsFromAdobeData(
  data: AdobeStructuredData
): ParsedTransaction[] {
  const tables = data.tables ?? [];
  if (!tables.length) return [];

  const transactions: ParsedTransaction[] = [];

  for (const table of tables) {
    const rows = table.Rows ?? [];
    const headers = table.Headers?.[0] ?? [];

    // Detect column indices by header names
    const headerNames = headers.map(cellToString).map((h) => h.toLowerCase());

    const dateIdx = headerNames.findIndex((h) => /date|dt/i.test(h));
    const descIdx = headerNames.findIndex((h) =>
      /description|particulars|narration|details/i.test(h)
    );
    const debitIdx = headerNames.findIndex((h) => /debit|withdrawal|dr/i.test(h));
    const creditIdx = headerNames.findIndex((h) => /credit|deposit|cr/i.test(h));
    const balanceIdx = headerNames.findIndex((h) => /balance|bal/i.test(h));
    const amountIdx = headerNames.findIndex((h) => /amount|amt/i.test(h) && h !== "balance");

    if (dateIdx === -1) continue; // Must have date column

    for (const row of rows) {
      const cells = row;
      if (!cells || cells.length === 0) continue;

      const dateStr = cellToString(cells[dateIdx]);
      const date = parseFlexibleDate(dateStr);
      if (!date) continue;

      const description = descIdx >= 0 ? cellToString(cells[descIdx]) : "";
      if (!description) continue;

      let debit: number | null = null;
      let credit: number | null = null;

      if (debitIdx >= 0) {
        const debitStr = cellToString(cells[debitIdx]);
        if (debitStr) debit = normalizeAmount(debitStr);
      }

      if (creditIdx >= 0) {
        const creditStr = cellToString(cells[creditIdx]);
        if (creditStr) credit = normalizeAmount(creditStr);
      }

      // If only amount column exists, infer debit/credit from sign
      if (amountIdx >= 0 && debit === null && credit === null) {
        const amountStr = cellToString(cells[amountIdx]);
        if (amountStr) {
          const amt = normalizeAmount(amountStr);
          if (amt !== null) {
            if (amt < 0) {
              debit = Math.abs(amt);
            } else {
              credit = amt;
            }
          }
        }
      }

      const amount = debit ?? credit ?? 0;
      if (amount === 0) continue;

      const transactionType = inferTypeFromAmount(debit, credit);

      let balance: number | null = null;
      if (balanceIdx >= 0) {
        const balStr = cellToString(cells[balanceIdx]);
        if (balStr) balance = normalizeAmount(balStr);
      }

      const transaction: ParsedTransaction = {
        date,
        datetime: `${date}T00:00:00`,
        description,
        transaction_type: transactionType,
        amount,
        balance,
      };

      transactions.push(transaction);
    }
  }

  return transactions;
}
