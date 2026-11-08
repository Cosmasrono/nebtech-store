// Sends email through the SMTP account in .env (MAIL_HOST, MAIL_USERNAME, ...).
import nodemailer from "nodemailer";

let transporter = null;

export function mailConfigured() {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USERNAME && process.env.MAIL_PASSWORD);
}

function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.MAIL_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port,
    secure: port === 465 || process.env.MAIL_ENCRYPTION === "ssl",
    auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
  });
  return transporter;
}

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) throw new Error("Email is not configured. Set MAIL_HOST, MAIL_USERNAME and MAIL_PASSWORD in .env.");
  const fromName = process.env.MAIL_FROM_NAME || process.env.NEXT_PUBLIC_APP_NAME || "Mwananchi Pharmacy";
  const fromAddress = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME;
  await getTransporter().sendMail({ from: `"${fromName}" <${fromAddress}>`, to, subject, text, html });
}

/** Tells an owner about a high-severity alert: what happened, and a link to review it. */
export async function sendSecurityAlertEmail({ to, actor, when, reasons }) {
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Mwananchi Pharmacy";
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const link = base ? `${base}/audit-logs` : null;
  const time = new Date(when).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const note = "This is an automatic check and may be a false alarm. Please look into it before acting.";
  const text = `Suspicious activity on ${app}\n\nBy: ${actor}\nWhen: ${time} (Nairobi)\n\n${reasons.map((r) => `- ${r}`).join("\n")}\n\n${note}${link ? `\n\nReview it: ${link}` : ""}`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="color:#be123c;margin:0 0 16px">Suspicious activity on ${escapeHtml(app)}</h2>
    <p><b>By:</b> ${escapeHtml(actor)}<br><b>When:</b> ${escapeHtml(time)} (Nairobi)</p>
    <ul>${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
    <p style="font-size:13px;color:#64748b">${escapeHtml(note)}</p>
    ${link ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Review alert</a></p>` : ""}
  </div>`;
  await sendMail({ to, subject: `Security alert: suspicious activity on ${app}`, text, html });
}

/** Email with a single button linking to the set-password page. */
export async function sendPasswordLinkEmail({ to, name, link, purpose, expiresHours }) {
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Mwananchi Pharmacy";
  const invite = purpose === "invite";
  const subject = invite ? `You've been added to ${app}` : `Reset your ${app} password`;
  const intro = invite
    ? `An account has been created for you on ${app}. Click the button below to set your password and sign in.`
    : `We received a request to reset your ${app} password. Click the button below to choose a new one.`;
  const outro = invite
    ? `This link works once and expires in ${expiresHours} hours. If it expires, ask your administrator to send a new one.`
    : `This link works once and expires in ${expiresHours} hour${expiresHours === 1 ? "" : "s"}. If you didn't ask for this, you can ignore this email.`;
  const button = invite ? "Set my password" : "Reset password";

  const text = `Hi ${name},\n\n${intro}\n\n${link}\n\n${outro}\n\n${app}`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="color:#0f766e;margin:0 0 16px">${escapeHtml(app)}</h2>
    <p>Hi ${escapeHtml(name)},</p>
    <p>${escapeHtml(intro)}</p>
    <p style="margin:28px 0">
      <a href="${escapeHtml(link)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${button}</a>
    </p>
    <p style="font-size:13px;color:#64748b">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
    <p style="font-size:13px;color:#64748b">${escapeHtml(outro)}</p>
  </div>`;
  await sendMail({ to, subject, text, html });
}
