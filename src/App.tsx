import { FormEvent, useState } from "react";
import "./index.css";

type Step = 0 | 1 | 2 | 3;

const steps = ["Business", "Store", "Administrator", "Ready"];

function LogoMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-slate-950 text-lg font-black tracking-tight text-white shadow-lg shadow-slate-950/10">
      O
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
      />
    </label>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>(0);
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");

  const next = (event: FormEvent) => {
    event.preventDefault();
    setStep((current) => Math.min(current + 1, 3) as Step);
  };

  const back = () => setStep((current) => Math.max(current - 1, 0) as Step);

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <div className="text-[15px] font-bold tracking-tight">OLYR POS</div>
              <div className="text-xs font-medium text-slate-400">by OLYR Labs</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs font-medium text-slate-400 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Offline-first
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-3xl">
            {step < 3 && (
              <div className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-500">
                    Setup · Step {step + 1} of 3
                  </span>
                  <span className="text-sm font-medium text-slate-400">Takes about 2 minutes</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${((step + 1) / 3) * 100}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 text-xs font-semibold text-slate-400">
                  {steps.slice(0, 3).map((item, index) => (
                    <span key={item} className={index <= step ? "text-sky-600" : ""}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              {step === 0 && (
                <form onSubmit={next} className="p-7 sm:p-10">
                  <div className="mb-9 max-w-xl">
                    <div className="mb-4 inline-flex rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-sky-600">
                      Welcome to OLYR POS
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Let&apos;s set up your business.</h1>
                    <p className="mt-3 text-[15px] leading-6 text-slate-500">
                      This information appears on your receipts and helps OLYR POS organize your business.
                    </p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label="Business name" value={businessName} onChange={setBusinessName} placeholder="e.g. Sunrise Supermarket" />
                    </div>
                    <Field label="Phone number" value={businessPhone} onChange={setBusinessPhone} placeholder="e.g. 011 234 5678" required={false} />
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">Currency</span>
                      <select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10" defaultValue="LKR">
                        <option value="LKR">LKR — Sri Lankan Rupee</option>
                        <option value="USD">USD — US Dollar</option>
                        <option value="EUR">EUR — Euro</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-9 flex justify-end">
                    <button type="submit" className="primary-button">Continue <span>→</span></button>
                  </div>
                </form>
              )}

              {step === 1 && (
                <form onSubmit={next} className="p-7 sm:p-10">
                  <div className="mb-9 max-w-xl">
                    <div className="mb-4 inline-flex rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-sky-600">Your first location</div>
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Add your store.</h1>
                    <p className="mt-3 text-[15px] leading-6 text-slate-500">You can add more branches later. OLYR POS is designed for multiple stores from day one.</p>
                  </div>
                  <div className="grid gap-5">
                    <Field label="Store name" value={storeName} onChange={setStoreName} placeholder={businessName || "e.g. Main Branch"} />
                    <Field label="Store address" value={storeAddress} onChange={setStoreAddress} placeholder="e.g. 123 Main Street, Colombo" />
                  </div>
                  <div className="mt-9 flex items-center justify-between">
                    <button type="button" onClick={back} className="secondary-button">← Back</button>
                    <button type="submit" className="primary-button">Continue <span>→</span></button>
                  </div>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={next} className="p-7 sm:p-10">
                  <div className="mb-9 max-w-xl">
                    <div className="mb-4 inline-flex rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-sky-600">Your administrator</div>
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Create your owner account.</h1>
                    <p className="mt-3 text-[15px] leading-6 text-slate-500">This account will have full control of your OLYR POS system. You can create staff accounts later.</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Your name" value={adminName} onChange={setAdminName} placeholder="e.g. Banuka Perera" />
                    <Field label="Email address" value={adminEmail} onChange={setAdminEmail} placeholder="you@example.com" type="email" />
                    <div className="sm:col-span-2">
                      <Field label="Password" value={password} onChange={setPassword} placeholder="Create a strong password" type="password" />
                      <p className="mt-2 text-xs text-slate-400">Use at least 8 characters. Your password will be protected locally.</p>
                    </div>
                  </div>
                  <div className="mt-9 flex items-center justify-between">
                    <button type="button" onClick={back} className="secondary-button">← Back</button>
                    <button type="submit" className="primary-button">Finish setup <span>→</span></button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <div className="p-8 text-center sm:p-12">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600">✓</div>
                  <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-sky-600">You&apos;re ready</p>
                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Welcome to OLYR POS.</h1>
                  <p className="mx-auto mt-3 max-w-lg text-[15px] leading-6 text-slate-500">
                    {businessName || "Your business"} is ready to start selling. Next we&apos;ll connect this setup to the local database and build the real POS workspace.
                  </p>
                  <div className="mx-auto mt-8 grid max-w-xl gap-3 text-left sm:grid-cols-3">
                    {[businessName || "Business", storeName || "Store", adminName || "Administrator"].map((item, index) => (
                      <div key={`${item}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{steps[index]}</div>
                        <div className="mt-1 truncate text-sm font-bold text-slate-800">{item}</div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setStep(0)} className="mt-9 secondary-button">Restart setup</button>
                </div>
              )}
            </section>

            <p className="mt-6 text-center text-xs leading-5 text-slate-400">
              OLYR POS works offline. Your business data stays on this device unless you choose to sync or back it up later.
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-between text-xs text-slate-400">
          <span>OLYR Labs</span>
          <span>OLYR POS · v0.1.0</span>
        </footer>
      </div>
    </main>
  );
}
