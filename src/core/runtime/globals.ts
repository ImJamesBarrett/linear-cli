import { z } from "zod";

import type { GlobalCliOptions } from "../../types/cli.js";

const globalOptionsSchema = z.object({
  allowPartialData: z.boolean().default(false),
  format: z.enum(["human", "json"]).default("human"),
  header: z.array(z.string()).default([]),
  profile: z.string().trim().min(1).nullable().optional(),
  publicFileUrlsExpireIn: z
    .string()
    .trim()
    .min(1)
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive())
    .nullable()
    .optional(),
  verbose: z.boolean().default(false),
});

export function normalizeGlobalOptions(raw: Record<string, unknown>): GlobalCliOptions {
  const parsed = globalOptionsSchema.parse({
    ...raw,
    profile: raw.profile ?? null,
    publicFileUrlsExpireIn: raw.publicFileUrlsExpireIn ?? null,
  });

  return {
    allowPartialData: parsed.allowPartialData,
    format: parsed.format,
    headers: parsed.header,
    profile: parsed.profile ?? null,
    publicFileUrlsExpireIn: parsed.publicFileUrlsExpireIn ?? null,
    verbose: parsed.verbose,
  };
}

