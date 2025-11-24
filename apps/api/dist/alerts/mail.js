import nodemailer from 'nodemailer';
import { env } from '../env.js';
let transporter = null;
export function getTransporter() {
    if (transporter)
        return transporter;
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
        throw new Error('smtp_not_configured');
    }
    transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: !!env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    return transporter;
}
export async function sendEmail({ to, subject, text, html, from, attachments }) {
    const t = getTransporter();
    const fromAddr = from || env.ALERT_FROM || env.SMTP_USER || 'no-reply@example.com';
    await t.sendMail({ from: fromAddr, to, subject, text, html, attachments });
}
