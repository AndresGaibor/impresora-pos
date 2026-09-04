import { z } from 'zod';
export const UpdateManifestSchema = z.object({ version: z.string().min(1), url: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/i), publishedAt: z.string().datetime(), signature: z.string().min(1) }).strict();
export type UpdateManifest = z.infer<typeof UpdateManifestSchema>;
