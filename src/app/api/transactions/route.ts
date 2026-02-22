import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  date: z.string().min(1), // YYYY-MM-DD
  time: z.string().optional().default("00:00"),
  transaction_type: z.enum(["Debit", "Credit"]),
  amount: z.number().positive(),
  counterparty: z.string().optional().nullable(),
  narration: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  utr: z.string().optional().nullable(),
  transaction_id: z.string().optional().nullable(),
  account_mask: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } },
        { status: 400 }
      );
    }

    const v = parsed.data;
    const hhmm = /^\d{2}:\d{2}$/.test(v.time) ? v.time : "00:00";
    const datetime = `${v.date}T${hhmm}:00`;

    const debit = v.transaction_type === "Debit" ? v.amount : 0;
    const credit = v.transaction_type === "Credit" ? v.amount : 0;

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        date: v.date,
        time: hhmm,
        datetime,
        counterparty: v.counterparty ?? null,
        narration: v.narration ?? null,
        description: v.description ?? null,
        transaction_type: v.transaction_type,
        amount: v.amount,
        debit,
        credit,
        utr: v.utr ?? null,
        transaction_id: v.transaction_id ?? null,
        account_mask: v.account_mask ?? null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: { code: "SUPABASE_INSERT_FAILED", message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: { code: "UNKNOWN", message } }, { status: 500 });
  }
}
