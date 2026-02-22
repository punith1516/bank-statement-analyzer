import { NextResponse } from "next/server";

import { extractPdfWithAdobe, AdobeExtractException } from "@/lib/adobe/extractPdfWithAdobe";
import { parseTransactionsFromAdobeData } from "@/lib/adobe/parseAdobeTransactions";
import type { ParsedTransaction, TransactionRow } from "@/lib/types";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Adobe API can take time

function toRow(t: ParsedTransaction, sourceFile: string): TransactionRow {
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
    source_file: sourceFile,
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
    | "PASSWORD_PROTECTED"
    | "FILE_TOO_LARGE"
    | "TIMEOUT"
    | "INVALID_PDF"
    | "RATE_LIMIT"
    | "NO_TRANSACTIONS"
    | "SUPABASE_INSERT_FAILED"
    | "UNKNOWN";
  message: string;
  details?: string;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

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

    // Adobe supports up to 100MB
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "PDF too large. Max 100MB.",
          } as ApiError,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let structuredData;
    try {
      structuredData = await extractPdfWithAdobe(buffer, file.name);
    } catch (e: unknown) {
      if (e instanceof AdobeExtractException) {
        return NextResponse.json(
          { error: { code: e.code, message: e.message } as ApiError },
          { status: e.code === "RATE_LIMIT" ? 429 : 400 }
        );
      }
      return NextResponse.json(
        { error: { code: "INVALID_PDF", message: "Failed to extract PDF" } as ApiError },
        { status: 400 }
      );
    }

    const transactions = parseTransactionsFromAdobeData(structuredData);

    if (!transactions.length) {
      return NextResponse.json(
        {
          error: {
            code: "NO_TRANSACTIONS",
            message: "No transaction tables detected in PDF.",
          } as ApiError,
        },
        { status: 400 }
      );
    }

    // De-dupe by (date, amount, description)
    const byKey = new Map<string, ParsedTransaction>();
    for (const t of transactions) {
      const key = `${t.date}|${t.amount}|${t.description}`;
      if (!byKey.has(key)) byKey.set(key, t);
    }

    const deduped = Array.from(byKey.values());
    const rows = deduped.map((t) => toRow(t, file.name));

    const supabase = supabaseServer();

    const chunks = chunkArray(rows, 500);
    for (const c of chunks) {
      const { error } = await supabase.from("transactions").upsert(c, {
        onConflict: "utr,date,amount",
        ignoreDuplicates: true,
      });

      if (error) {
        return NextResponse.json(
          {
            error: {
              code: "SUPABASE_INSERT_FAILED",
              message: "Database insert failed",
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
      { error: { code: "UNKNOWN", message } as ApiError },
      { status: 500 }
    );
  }
}
