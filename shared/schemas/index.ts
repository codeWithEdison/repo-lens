/**
 * Runtime request validation schemas (Zod).
 *
 * API input is validated at runtime — TypeScript interfaces alone are not
 * sufficient for untrusted request bodies.
 */

import { z } from "zod";

export const repositoryInputSchema = z.object({
  url: z.string().min(1, "Repository URL is required").max(500),
  branch: z
    .string()
    .max(255)
    // Reject shell/path unsafe branch names up front.
    .regex(/^[\w./\-]+$/, "Invalid branch name")
    .optional(),
  accessToken: z.string().min(1).max(500).optional(),
});

export const createAnalysisSchema = z.object({
  repositories: z
    .array(repositoryInputSchema)
    .min(1, "At least one repository is required"),
});

export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>;
export type RepositoryInputSchema = z.infer<typeof repositoryInputSchema>;
