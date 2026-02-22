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
    utr: t.utr ?? null,
    transaction_id: t.transaction_id ?? null,
    account_mask: t.account_mask ?? null,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

type ApiError = {
  code:
  | "INVALID_REQUEST"
  | "INVALID_PDF"
  | "PDF_PASSWORD_REQUIRED"
  | "PDF_PASSWORD_INCORRECT"
  | "PDF_PASSWORD_UNSUPPORTED"
  | "NO_TRANSACTIONS"
  | "SUPABASE_INSERT_FAILED";
  message: string;
  details?: string;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const passwordRaw = formData.get("password");
    const password = typeof passwordRaw === "string" ? passwordRaw : undefined;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Missing PDF file" } as ApiError },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid file type. Upload a PDF.",
          } as ApiError,
        },
        { status: 400 }
      );
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "PDF too large. Max 20MB.",
          } as ApiError,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let text: string;
    try {
      text = await extractPdfText(buffer, password);
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        return NextResponse.json(
          { error: { code: e.code, message: e.message } as ApiError },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: { code: "INVALID_PDF", message: "Invalid PDF or unable to read PDF text" } as ApiError },
        { status: 400 }
      );
    }

    const transactions = extractPhonePeTransactionsFromText(text);

    if (!transactions.length) {
      return NextResponse.json(
        {
          error: {
            code: "NO_TRANSACTIONS",
            message: "No transactions detected. Ensure this is a PhonePe statement PDF.",
          } as ApiError,
        },
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
            error: {
              code: "SUPABASE_INSERT_FAILED",
              message: "Supabase insert failed",
              details: error.message,
            } as ApiError,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      extracted_count: transactions.length,
      deduped_count: deduped.length,
      transactions: deduped,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message } as ApiError },
      { status: 500 }
    );
  }
}
