import { NextResponse } from "next/server";

import { extractPhonePeTransactionsFromText } from "@/lib/phonepe/parsePhonePeStatement";
import { extractPdfText, PdfPasswordError } from "@/lib/pdf/extractPdfText";
import type { ParsedTransaction, TransactionRow } from "@/lib/types";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toRow(t: ParsedTransaction): TransactionRow {
  const debit = t.transaction_type === "Debit" ? t.amount : 0;
  const credit = t.transaction_type === "Credit" ? t.amount : 0;

  return {
    date: t.date,
    time: t.time ?? null,
    datetime: t.datetime,
    description: t.description || null,
    counterparty: t.counterparty ?? null,
    narration: t.narration ?? null,
    transaction_type: t.transaction_type,
    debit,
    credit,
    amount: t.amount,
    balance: t.balance ?? null,
    utr: t.utr ?? null,
    transaction_id: t.transaction_id ?? null,
    account_mask: t.account_mask ?? null,
    source_file: null,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Invalid file type. Upload a PDF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let text: string;
      try {
        text = await extractPdfText(buffer);
      } catch (e) {
      if (e instanceof PdfPasswordError) {
        return NextResponse.json(
          { error: "PDF is password protected. Use /api/process-phonepe-pdf with password." },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: "Invalid PDF or unable to read PDF text" }, { status: 400 });
    }

    const transactions = extractPhonePeTransactionsFromText(text);

    if (!transactions.length) {
      return NextResponse.json(
        { error: "No transactions detected. Ensure this is a PhonePe statement PDF." },
        { status: 400 }
      );
    }

    // De-dupe by UTR first (when present)
    const byKey = new Map<string, ParsedTransaction>();
    for (const t of transactions) {
      const key = t.utr ? `utr:${t.utr}` : `fallback:${t.transaction_id}|${t.datetime}|${t.amount}`;
      if (!byKey.has(key)) byKey.set(key, t);
    }

    const deduped = Array.from(byKey.values());
    const rows = deduped.map(toRow);

    const supabase = supabaseServer();

    const chunks = chunkArray(rows, 500);
    for (const c of chunks) {
      const { error } = await supabase
        .from("transactions")
        .upsert(c, { onConflict: "utr", ignoreDuplicates: true });

      if (error) {
        return NextResponse.json(
          {
            error: "Supabase insert failed",
            details: error.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      extracted_count: transactions.length,
      deduped_count: deduped.length,
      inserted_note:
        "Inserted with UTR de-duplication (UTR duplicates ignored). Rows without UTR will always insert.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
