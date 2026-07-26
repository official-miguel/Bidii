"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Mail, Lock, School } from "lucide-react";

const STORAGE_KEY = "bidii_login_draft";

const inputCls =
  "w-full rounded-xl border border-line bg-paper pl-10 pr-4 py-3 text-sm text-ink " +
  "placeholder:text-slate/40 " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "hover:border-slate/40 transition-colors " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text dark:placeholder:text-dark-muted/50";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = params.get("notice");

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [schoolSlug,   setSchoolSlug]   = useState("");
  const [needsSlug,    setNeedsSlug]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { email?: string };
        if (draft.email) setEmail(draft.email);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ email })); }
    catch { /* ignore */ }
  }, [email]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(needsSlug && schoolSlug ? { schoolSlug } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.requiresSchoolSlug) {
          // Password was correct but matched accounts at multiple schools.
          // Show the school identifier field so the user can disambiguate.
          setNeedsSlug(true);
          setError(data.error || "Please enter your school identifier to continue.");
          return;
        }
        // Reset the slug step on any other error so the user can retry cleanly.
        setNeedsSlug(false);
        setSchoolSlug("");
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      if (data.role === "PRINCIPAL")        router.push("/principal");
      else if (data.role === "TEACHER")     router.push("/teacher");
      else if (data.role === "ADMIN_STAFF") router.push("/staff");
      else                                  router.push("/login?notice=dashboard-not-ready");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden
                    bg-gradient-to-br from-teal-50/60 via-white to-slate-50
                    dark:from-[#0A1628] dark:via-[#0D2035] dark:to-[#0A1628]">

      {/* Subtle dot grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle, #2C7F7E 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Glow orbs — dark mode only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/4 left-1/3 w-96 h-96 rounded-full opacity-0 dark:opacity-[0.08]"
        style={{ background: "radial-gradient(circle, #2C7F7E, transparent 70%)" }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="rounded-2xl bg-teal/10 dark:bg-white/10 ring-1 ring-teal/20 dark:ring-white/20 p-4 mb-5 shadow-md">
            <Image src="/logo.png" alt="Bidii" width={72} height={72} className="object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold text-ink dark:text-white tracking-tight">Welcome back</h1>
          <p className="text-slate dark:text-white/50 text-sm mt-1">Sign in to your school account</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#162233] rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          {/* Teal accent strip */}
          <div className="h-0.5" style={{ background: "linear-gradient(90deg, #2C7F7E, #3A9998, #2C7F7E)" }} />

          <div className="p-7">
            {notice === "dashboard-not-ready" && (
              <div className="mb-5 rounded-xl bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3">
                That account&apos;s dashboard isn&apos;t available yet.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                  <input id="email" type="email" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.com" className={inputCls} />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                  <input id="password" type={showPassword ? "text" : "password"} required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputCls} pr-11`} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-11
                               text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text transition-colors"
                    tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* School identifier — only shown after password is confirmed valid
                   but the account exists at multiple schools */}
              {needsSlug && (
                <div>
                  <label htmlFor="schoolSlug" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                    School identifier
                  </label>
                  <div className="relative">
                    <School className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
                    <input id="schoolSlug" type="text" required autoComplete="off"
                      value={schoolSlug} onChange={(e) => setSchoolSlug(e.target.value)}
                      placeholder="e.g. greenwood-primary"
                      className={inputCls} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate dark:text-dark-muted">
                    Your school identifier was provided by your administrator.
                  </p>
                </div>
              )}

              {error && (
                <div role="alert" className="rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full rounded-xl text-white text-sm font-semibold py-3 mt-1
                           shadow-md hover:shadow-lg transition-all duration-150
                           disabled:opacity-60 disabled:cursor-not-allowed
                           focus:outline-none focus:ring-2 focus:ring-teal/40 focus:ring-offset-2"
                style={{ background: "linear-gradient(135deg, #2C7F7E 0%, #1F5C5B 100%)" }}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-slate dark:text-white/40 mt-6">
          New school?{" "}
          <a href="/signup" className="text-teal dark:text-[#3A9998] font-semibold hover:underline transition-colors">
            Create your account
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
