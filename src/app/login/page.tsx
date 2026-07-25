"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "bidii_login_draft";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = params.get("notice");

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);

  // ── Restore draft from sessionStorage on mount ───────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { email?: string };
        // Only restore the email — never restore the password for security.
        if (draft.email) setEmail(draft.email);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // ── Persist email to sessionStorage whenever it changes ──────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ email }));
    } catch {
      // Storage quota exceeded — fail silently
    }
  }, [email]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }

      // Clear draft on successful login
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

      if (data.role === "PRINCIPAL") {
        router.push("/principal");
      } else if (data.role === "TEACHER") {
        router.push("/teacher");
      } else if (data.role === "ADMIN_STAFF") {
        router.push("/staff");
      } else {
        router.push("/login?notice=dashboard-not-ready");
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-dark-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.png"
              alt="Bidii KE — Smart Schools. Simple Future."
              width={160}
              height={160}
              className="object-contain"
              priority
            />
          </div>
          <p className="text-slate text-sm mt-1 dark:text-dark-muted">Smart Schools. Simple Future.</p>
        </div>

        <div className="bg-card border border-line rounded-xl p-6 shadow-sm dark:bg-dark-surface dark:border-dark-border">
          {notice === "dashboard-not-ready" && (
            <div className="mb-4 rounded-lg bg-warn-bg border border-warn/20 text-warn text-sm px-3 py-2.5">
              That account&apos;s dashboard isn&apos;t available yet. Only the Principal
              dashboard is live right now.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink
                           placeholder:text-slate-light
                           focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15
                           transition-colors dark:bg-dark-surface dark:border-dark-border
                           dark:text-dark-text dark:placeholder:text-dark-muted"
                placeholder="you@bidii.school"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink dark:text-dark-text mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 pr-10 text-sm text-ink
                             placeholder:text-slate-light
                             focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15
                             transition-colors dark:bg-dark-surface dark:border-dark-border
                             dark:text-dark-text dark:placeholder:text-dark-muted"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-10
                             text-slate hover:text-ink transition-colors
                             dark:text-dark-muted dark:hover:text-dark-text"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                    : <Eye    className="h-4 w-4" aria-hidden="true" />
                  }
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-danger-bg border border-danger/20 text-danger text-sm px-3.5 py-2.5"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-teal text-white text-sm font-medium py-2.5
                         hover:bg-teal-dark active:scale-[0.98] transition-all duration-100
                         disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
                         focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2
                         shadow-xs"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate dark:text-dark-muted mt-6">
          New school?{" "}
          <a href="/signup" className="text-teal font-semibold hover:underline transition-colors">
            Create your school account
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
