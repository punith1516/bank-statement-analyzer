import { supabaseServer } from "@/lib/supabase/server";
import DashboardCharts from "@/components/DashboardCharts";
import Link from "next/link";
import DescriptionEditor from "@/components/DescriptionEditor";
import AddTransactionForm from "@/components/AddTransactionForm";
import {
  computeSummary,
  dailySpendTrend,
  monthlyDebitCredit,
  topCounterpartyDebit,
  typePie,
  type TransactionRecord,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

function money(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function DashboardPage() {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, date, datetime, counterparty, transaction_type, debit, credit, amount, utr, transaction_id, narration, account_mask, description"
    )
    .order("datetime", { ascending: false })
    .limit(5000);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <Link href="/" className="text-sm font-semibold text-zinc-900">
            ← Back
          </Link>
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
            <div className="font-semibold">Supabase query failed</div>
            <div className="mt-1 text-sm">{error.message}</div>
          </div>
        </div>
      </div>
    );
  }

  type DashboardTx = TransactionRecord & { id: string; description: string | null };
  const transactions = (data ?? []) as unknown as DashboardTx[];

  const summary = computeSummary(transactions);
  const monthly = monthlyDebitCredit(transactions);
  const daily = dailySpendTrend(transactions);
  const typeSplit = typePie(transactions);
  const topCounterparty = topCounterpartyDebit(transactions, 10);

  const recent = transactions.slice(0, 20);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Showing up to {transactions.length} most recent transactions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              Upload
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold text-zinc-500">Total Debit</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">{money(summary.totalDebit)}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold text-zinc-500">Total Credit</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">{money(summary.totalCredit)}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold text-zinc-500">Net Balance Change</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">{money(summary.netChange)}</div>
          </div>
        </div>

        <div className="mt-8">
          <DashboardCharts
            monthly={monthly}
            daily={daily}
            typeSplit={typeSplit}
            topCounterparty={topCounterparty}
          />
        </div>

        <div className="mt-8">
          <AddTransactionForm />
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-900">Recent Transactions</div>
            <div className="text-xs text-zinc-500">Latest 20</div>
          </div>

          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="py-2 pr-4">Datetime</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Counterparty</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">UTR</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t, idx) => (
                  <tr key={`${t.utr ?? "na"}-${idx}`} className="border-b border-zinc-100">
                    <td className="py-2 pr-4 font-medium text-zinc-900">{t.datetime}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          t.transaction_type === "Debit"
                            ? "bg-zinc-100 text-zinc-900"
                            : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {t.transaction_type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-zinc-900">{t.counterparty ?? "Unknown"}</td>
                    <td className="py-2 pr-4 text-zinc-900">{money(Number(t.amount) || 0)}</td>
                    <td className="py-2 pr-4">
                      <DescriptionEditor id={t.id} initialDescription={t.description ?? null} />
                    </td>
                    <td className="py-2 pr-4 text-zinc-600">{t.utr ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
