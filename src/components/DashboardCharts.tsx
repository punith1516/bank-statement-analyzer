"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  monthly: Array<{ month: string; debit: number; credit: number }>;
  daily: Array<{ date: string; spend: number }>;
  typeSplit: Array<{ name: string; value: number }>;
  topCounterparty: Array<{ counterparty: string; spend: number }>;
};

const pieColors = ["#0f172a", "#16a34a"]; // slate-900, green-600

function money(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardCharts({ monthly, daily, typeSplit, topCounterparty }: Props) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Monthly Debit vs Credit</div>
          <div className="mt-4 h-80 min-h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={monthly} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
                <Bar dataKey="debit" name="Debit" fill="#0f172a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="credit" name="Credit" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Daily Spend Trend</div>
          <div className="mt-4 h-80 min-h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <LineChart data={daily} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} hide={daily.length > 60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Line type="monotone" dataKey="spend" stroke="#0f172a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Debit vs Credit Ratio</div>
          <div className="mt-4 h-72 min-h-[288px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <PieChart>
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
                <Pie data={typeSplit} dataKey="value" nameKey="name" outerRadius={90} label>
                  {typeSplit.map((_, idx) => (
                    <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">Top Counterparty Spend (Debit)</div>
          <div className="mt-4 h-72 min-h-[288px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={topCounterparty} layout="vertical" margin={{ left: 20, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="counterparty" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="spend" fill="#0f172a" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
