"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const inputCls =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink " +
  "placeholder:text-slate-light " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "transition-colors dark:bg-dark-surface dark:border-dark-border " +
  "dark:text-dark-text dark:placeholder:text-dark-muted";

const labelCls = "block text-sm font-medium text-ink dark:text-dark-text mb-1.5";

export default function SignupPage() {
  const router = useRouter();

  const [schoolName, setSchoolName]         = useState("");
  const [schoolAddress, setSchoolAddress]   = useState("");
  const [schoolPhone, setSchoolPhone]       = useState("");
  const [fullName, setFullName]             = useState("");
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolName, schoolAddress, schoolPhone, fullName, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }

      router.push("/principal");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-dark-bg px-4 py-10">
      <div className="w-full max-w-md">

        {/* Logo + heading */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.png"
              alt="Bidii KE — Smart Schools. Simple Future."
              width={140}
              height={140}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Create your school</h1>
          <p className="text-slate text-sm mt-1 dark:text-dark-muted">
            Set up Bidii for your school and sign in as Principal.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-card border border-line rounded-xl p-6 shadow-sm dark:bg-dark-surface dark:border-dark-border">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            {/* School details section */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate dark:text-dark-muted mb-3">
                School details
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="schoolName" className={labelCls}>School name</label>
                  <input
                    id="schoolName" required
                    value={schoolName} onChange={(e) => setSchoolName(e.target.value)}
                    className={inputCls} placeholder="Green Hill Academy"
                  />
                </div>
                <div>
                  <label htmlFor="schoolAddress" className={labelCls}>
                    Address{" "}
                    <span className="text-slate/60 font-normal dark:text-dark-muted/60">(optional)</span>
                  </label>
                  <input
                    id="schoolAddress"
                    value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)}
                    className={inputCls} placeholder="P.O. Box 123, Nairobi"
                  />
                </div>
                <div>
                  <label htmlFor="schoolPhone" className={labelCls}>
                    School phone{" "}
                    <span className="text-slate/60 font-normal dark:text-dark-muted/60">(optional)</span>
                  </label>
                  <input
                    id="schoolPhone"
                    value={schoolPhone} onChange={(e) => setSchoolPhone(e.target.value)}
                    className={inputCls} placeholder="+254 7xx xxx xxx"
                  />
                </div>
              </div>
            </div>

            {/* Principal login section */}
            <div className="border-t border-line dark:border-dark-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate dark:text-dark-muted mb-3">
                Your Principal login
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="fullName" className={labelCls}>Your full name</label>
                  <input
                    id="fullName" required
                    value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className={inputCls} placeholder="Jane Wanjiru"
                  />
                </div>
                <div>
                  <label htmlFor="email" className={labelCls}>Email</label>
                  <input
                    id="email" type="email" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className={inputCls} placeholder="you@yourschool.com"
                  />
                </div>
                <div>
                  <label htmlFor="password" className={labelCls}>Password</label>
                  <input
                    id="password" type="password" required minLength={8}
                    autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className={inputCls} placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className={labelCls}>Confirm password</label>
                  <input
                    id="confirmPassword" type="password" required
                    autoComplete="new-password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputCls} placeholder="Re-enter password"
                  />
                </div>
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
              {loading ? "Creating your school…" : "Create school account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate dark:text-dark-muted mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-teal font-medium hover:underline transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
