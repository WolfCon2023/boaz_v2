import 'dotenv/config';
import { z } from 'zod';
const EnvSchema = z.object({
    PORT: z
        .string()
        .regex(/^\d+$/)
        .transform((v) => Number(v))
        .default('3000'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    JWT_SECRET: z.string().min(24).default('devsecret_devsecret_devsecret_devsecret'),
    ORIGIN: z.string().url().default('http://localhost:5173'),
    MONGO_URL: z.string().url().optional(),
});
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
    process.exit(1);
}
export const env = parsed.data;
