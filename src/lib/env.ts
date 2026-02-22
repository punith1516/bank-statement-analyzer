import { z } from "zod";

const serverEnvSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    PDF_SERVICES_CLIENT_ID: z.string().min(1).optional(),
    PDF_SERVICES_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.SUPABASE_SERVICE_ROLE_KEY || v.SUPABASE_ANON_KEY), {
    message: "Provide SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY",
    path: ["SUPABASE_SERVICE_ROLE_KEY"],
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    PDF_SERVICES_CLIENT_ID: process.env.PDF_SERVICES_CLIENT_ID,
    PDF_SERVICES_CLIENT_SECRET: process.env.PDF_SERVICES_CLIENT_SECRET,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid server env: ${message}`);
  }

  return parsed.data;
}
