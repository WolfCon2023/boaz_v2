import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .default('3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(24).default('devsecret_devsecret_devsecret_devsecret'),
  ORIGIN: z
    .string()
    .min(1)
    .refine(
      (val) =>
        val
          .split(',')
          .map((s) => s.trim())
          .every((o) => {
            if (o === '*' || o.startsWith('.')) return true
            try {
              // eslint-disable-next-line no-new
              new URL(o)
              return true
            } catch {
              return false
            }
          }),
      { message: 'Invalid url' }
    )
    .default('http://localhost:5173'),
  MONGO_URL: z.string().url().optional(),
  UPLOAD_DIR: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .optional(),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  ALERT_FROM: z.string().optional(),
  ALERT_TO: z.string().optional(),
  SLA_ALERT_WITHIN_MIN: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .optional(),
  SLA_ALERT_COOLDOWN_MIN: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .optional(),
  SENDGRID_API_KEY: z.string().optional(),
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
  OUTBOUND_EMAIL_FROM: z.string().email().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data


