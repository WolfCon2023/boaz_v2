import nodemailer from 'nodemailer'
import { env } from '../env.js'
import { hasEmailNotificationsEnabled } from './preferences-helper.js'

/**
 * Sends an email using available providers (SendGrid > Mailgun > SMTP)
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param text - Plain text email body
 * @param html - HTML email body
 * @param checkPreferences - If true, checks user's email notification preference before sending. Defaults to false for critical emails.
 */
export async function sendAuthEmail({ 
  to, 
  subject, 
  text, 
  html,
  checkPreferences = false 
}: { 
  to: string
  subject: string
  text?: string
  html?: string
  checkPreferences?: boolean
}) {
  // Check user preferences if requested
  if (checkPreferences) {
    const notificationsEnabled = await hasEmailNotificationsEnabled(undefined, to)
    if (notificationsEnabled === false) {
      // User has explicitly disabled email notifications
      console.log(`Email notification skipped for ${to}: user has disabled email notifications`)
      return { sent: false, reason: 'notifications_disabled', provider: null }
    }
    // If null (preference not set), default to sending
  }
  // Try SendGrid first
  if (env.SENDGRID_API_KEY && env.OUTBOUND_EMAIL_FROM) {
    try {
      const sgPayload = {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: env.OUTBOUND_EMAIL_FROM },
        subject,
        content: [
          html ? { type: 'text/html', value: String(html) } : undefined,
          text ? { type: 'text/plain', value: String(text) } : undefined,
        ].filter(Boolean),
      }
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sgPayload),
      })
      if (r.ok) {
        return { sent: true, provider: 'sendgrid' }
      }
    } catch (e) {
      // Fall through to next provider
    }
  }

  // Try Mailgun
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN && env.OUTBOUND_EMAIL_FROM) {
    try {
      const form = new URLSearchParams({
        to,
        from: env.OUTBOUND_EMAIL_FROM,
        subject,
        text: text || '',
        html: html || '',
      })
      const r = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from('api:' + env.MAILGUN_API_KEY).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      })
      if (r.ok) {
        return { sent: true, provider: 'mailgun' }
      }
    } catch (e) {
      // Fall through to SMTP
    }
  }

  // Try SMTP
  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: !!env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
      const fromAddr = env.ALERT_FROM || env.SMTP_USER || 'no-reply@example.com'
      await transporter.sendMail({ from: fromAddr, to, subject, text, html })
      return { sent: true, provider: 'smtp' }
    } catch (e) {
      throw new Error('All email providers failed')
    }
  }

  // No email providers configured
  // In development, log the email content
  if (env.NODE_ENV === 'development') {
    console.log('=== EMAIL (NO PROVIDER CONFIGURED) ===')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Text: ${text}`)
    console.log(`HTML: ${html}`)
    console.log('=====================================')
    return { sent: true, provider: 'console' }
  }

  throw new Error('No email provider configured')
}

