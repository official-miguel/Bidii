/**
 * src/lib/email.ts
 *
 * Two-tier email delivery:
 *
 * Tier 1 — School SMTP: if the school has configured its own SMTP credentials
 *   under Settings → Email (SMTP), emails are sent from that account.
 *
 * Tier 2 — Platform SMTP: if no school SMTP is configured, the platform's
 *   own SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 *   SMTP_FROM in env vars) are used as a fallback. The school's email address
 *   (School.email) is set as the Reply-To so staff see the school as the
 *   apparent sender.
 *
 * If neither tier is available, send functions silently succeed (non-fatal)
 * so callers don't need to guard against missing email config.
 */

import nodemailer from "nodemailer";
import { getSchoolIntegrationKey } from "./integrations";
import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// SMTP config resolution
// ---------------------------------------------------------------------------

interface SmtpConfig {
  host:     string;
  port:     number;
  secure:   boolean;
  user:     string;
  password: string;
  from:     string;
  replyTo?: string; // set when using platform SMTP — points to school email
}

/** Resolve school-configured SMTP credentials (Tier 1). */
async function getSchoolSmtpConfig(schoolId: string): Promise<SmtpConfig | null> {
  const integration = await getSchoolIntegrationKey(schoolId, "EMAIL");
  if (!integration) return null;

  const meta = (integration.metadata ?? {}) as Record<string, string>;
  const host = meta.host?.trim();
  const from = meta.from?.trim() || meta.user?.trim();
  const user = meta.user?.trim() || meta.from?.trim();
  if (!host || !from || !user) return null;

  return {
    host,
    port:     meta.port ? parseInt(meta.port, 10) : 587,
    secure:   meta.secure === "true",
    user,
    password: integration.apiKey,
    from,
  };
}

/** Resolve platform SMTP credentials (Tier 2 fallback). */
async function getPlatformSmtpConfig(schoolId: string): Promise<SmtpConfig | null> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !user || !pass || !from) return null;

  // Use the school's registered email as Reply-To so staff see the school
  const school = await prisma.school.findUnique({
    where:  { id: schoolId },
    select: { email: true, name: true },
  }).catch(() => null);

  const replyTo = school?.email?.trim() || undefined;

  return {
    host,
    port:     process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure:   process.env.SMTP_SECURE === "true",
    user,
    password: pass,
    from,
    replyTo,
  };
}

/** Resolve the best available SMTP config, Tier 1 first. */
async function resolveSmtpConfig(schoolId: string): Promise<SmtpConfig | null> {
  return (await getSchoolSmtpConfig(schoolId)) ?? (await getPlatformSmtpConfig(schoolId));
}

function createTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host:    cfg.host,
    port:    cfg.port,
    secure:  cfg.secure,
    auth:    { user: cfg.user, pass: cfg.password },
    tls:     { rejectUnauthorized: false },
  });
}

// ---------------------------------------------------------------------------
// Welcome / OTP email — sent when a new staff account is created
// ---------------------------------------------------------------------------

export interface WelcomeEmailPayload {
  schoolId:          string;
  schoolName:        string;
  recipientEmail:    string;
  recipientName:     string;
  temporaryPassword: string;
  loginUrl?:         string;
}

export async function sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<void> {
  const cfg = await resolveSmtpConfig(payload.schoolId);
  if (!cfg) return; // no email configured at any tier — silently skip

  const loginUrl =
    payload.loginUrl ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
      : "https://bidii.school/login");

  const html = buildWelcomeHtml({
    schoolName:        payload.schoolName,
    recipientName:     payload.recipientName,
    email:             payload.recipientEmail,
    temporaryPassword: payload.temporaryPassword,
    loginUrl,
  });

  const text = buildWelcomeText({
    schoolName:        payload.schoolName,
    recipientName:     payload.recipientName,
    email:             payload.recipientEmail,
    temporaryPassword: payload.temporaryPassword,
    loginUrl,
  });

  const transport = createTransport(cfg);

  await transport.sendMail({
    from:    cfg.from,
    to:      payload.recipientEmail,
    replyTo: cfg.replyTo,        // school email visible to recipient as Reply-To
    subject: `Your ${payload.schoolName} Bidii account is ready`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

interface TemplateVars {
  schoolName:        string;
  recipientName:     string;
  email:             string;
  temporaryPassword: string;
  loginUrl:          string;
}

function buildWelcomeHtml(v: TemplateVars): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Welcome to ${escapeHtml(v.schoolName)} on Bidii</title>
<style>
  body{margin:0;padding:0;background:#FAFBFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1F2933;}
  .wrapper{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #E8EDF2;overflow:hidden;}
  .header{background:#2C7F7E;padding:32px 40px 28px;}
  .header h1{margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.3px;}
  .header p{margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.75);}
  .body{padding:32px 40px;}
  .greeting{font-size:15px;font-weight:600;color:#1F2933;margin:0 0 12px;}
  .intro{font-size:14px;color:#667085;line-height:1.6;margin:0 0 24px;}
  .credentials{background:#EDF7F7;border:1px solid #A5D4D3;border-radius:10px;padding:20px 24px;margin:0 0 24px;}
  .credentials h2{margin:0 0 14px;font-size:12px;font-weight:700;color:#2C7F7E;text-transform:uppercase;letter-spacing:.6px;}
  .cred-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
  .cred-row:last-child{margin-bottom:0;}
  .cred-label{font-size:12px;color:#667085;font-weight:500;width:120px;flex-shrink:0;}
  .cred-value{font-size:13px;font-family:'Courier New',monospace;color:#1F2933;background:#fff;border:1px solid #E8EDF2;border-radius:6px;padding:6px 10px;flex:1;word-break:break-all;}
  .cta{text-align:center;margin:0 0 24px;}
  .cta a{display:inline-block;background:#2C7F7E;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;}
  .notice{background:#FFFAEB;border:1px solid #FEC84B;border-radius:8px;padding:14px 18px;margin:0 0 24px;}
  .notice p{margin:0;font-size:13px;color:#B54708;line-height:1.5;}
  .steps{margin:0 0 24px;padding:0;list-style:none;}
  .steps li{font-size:13px;color:#667085;line-height:1.6;padding:4px 0 4px 20px;position:relative;}
  .steps li::before{content:"→";position:absolute;left:0;color:#2C7F7E;font-weight:700;}
  .footer{background:#F9FAFB;border-top:1px solid #E8EDF2;padding:20px 40px;text-align:center;}
  .footer p{margin:0;font-size:12px;color:#98A2B3;line-height:1.6;}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${escapeHtml(v.schoolName)}</h1>
    <p>Powered by Bidii — Smart Schools. Simple Future.</p>
  </div>
  <div class="body">
    <p class="greeting">Welcome, ${escapeHtml(v.recipientName)}!</p>
    <p class="intro">
      Your staff account on the ${escapeHtml(v.schoolName)} school management system has been created.
      Use the credentials below to sign in for the first time.
    </p>
    <div class="credentials">
      <h2>Your login credentials</h2>
      <div class="cred-row">
        <span class="cred-label">Email</span>
        <span class="cred-value">${escapeHtml(v.email)}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">One-time password</span>
        <span class="cred-value">${escapeHtml(v.temporaryPassword)}</span>
      </div>
    </div>
    <div class="notice">
      <p><strong>Important:</strong> This one-time password expires the moment you log in.
         You will be asked to create a permanent password before accessing any features.</p>
    </div>
    <ul class="steps">
      <li>Open the link below and sign in with your email and one-time password.</li>
      <li>You will be prompted to choose a new, secure password immediately.</li>
      <li>Once your password is changed you will have full access to your dashboard.</li>
    </ul>
    <div class="cta">
      <a href="${v.loginUrl}">Sign in to Bidii</a>
    </div>
    <p class="intro" style="margin-bottom:0">
      If you didn&rsquo;t expect this email, please contact your school administrator.
      Do not share your credentials with anyone.
    </p>
  </div>
  <div class="footer">
    <p>${escapeHtml(v.schoolName)} uses Bidii, a secure cloud-based school management platform.</p>
    <p>This is an automated message — please do not reply directly to this email.</p>
  </div>
</div>
</body>
</html>`;
}

function buildWelcomeText(v: TemplateVars): string {
  return `Welcome to ${v.schoolName} on Bidii, ${v.recipientName}!

Your staff account has been created. Use the credentials below to sign in.

  Email:             ${v.email}
  One-time password: ${v.temporaryPassword}

IMPORTANT: This one-time password expires on first login. You will be
required to set a permanent password before accessing your dashboard.

Sign in here: ${v.loginUrl}

Steps:
1. Open the link above and enter your email and one-time password.
2. You will be prompted to create a new secure password immediately.
3. Once changed, you will have full access to your account.

If you did not expect this email, contact your school administrator.

---
${v.schoolName} uses Bidii — Smart Schools. Simple Future.
This is an automated message. Do not reply.
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
