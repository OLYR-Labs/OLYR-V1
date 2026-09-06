import "./index.css";

export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-12 shadow-xl shadow-slate-200/50">
          <div className="mb-10 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">
              O
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-600">
                OLYR Labs
              </p>
              <h1 className="text-2xl font-bold tracking-tight">OLYR POS</h1>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-4xl font-bold tracking-tight sm:text-5xl">
              Your business. Your system.
            </p>
            <p className="max-w-xl text-lg leading-8 text-slate-500">
              A fast, offline-first point-of-sale system built for real-world
              retail businesses.
            </p>
          </div>

          <div className="mt-10 flex items-center gap-3 rounded-2xl bg-slate-50 px-5 py-4 text-sm text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Foundation is running
          </div>
        </div>
      </section>
    </main>
  );
}
