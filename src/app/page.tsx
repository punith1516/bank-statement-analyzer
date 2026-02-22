import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Bank Statement Analyzer
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Upload PDF statements, extract transactions with Adobe Extract API, and view analytics.
            </p>
          </div>
          <a
            href="/dashboard"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
          >
            Dashboard
          </a>
        </div>

        <div className="mt-8">
          <UploadForm />
        </div>

        <div className="mt-8 grid gap-3 text-sm text-zinc-700">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="font-semibold text-zinc-900">What gets extracted</div>
            <div className="mt-1">
              Adobe Extract API uses AI/ML to detect tables and extract: date, description, debit,
              credit, balance. Supports PhonePe, bank statements, and other transaction PDFs.
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="font-semibold text-zinc-900">Duplicates</div>
            <div className="mt-1">
              Transactions are de-duplicated by (date + amount + description) to avoid double entries.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
