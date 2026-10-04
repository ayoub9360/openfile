import { z } from "zod"
const intent = z
  .string()
  .max(180)
  .optional()
  .describe(
    "A brief user-facing status describing this action, in the user's language. Do not include private reasoning."
  )
export const filterSchema = z
  .object({
    name: z
      .string()
      .max(180)
      .optional()
      .describe(
        "Literal filename substring only, not document content or subject. Omit for topic search."
      ),
    tags: z
      .array(z.string().max(80))
      .max(10)
      .optional()
      .describe(
        "Exact existing labels, matched case-insensitively with AND. Discover via listFacets; do not guess tags or combine synonyms."
      ),
    kind: z
      .enum(["Invoice", "Contract", "Certificate", "Statement", "Document"])
      .optional(),
    issuer: z.string().max(300).optional(),
    folder: z.string().max(1000).optional(),
    includeSubfolders: z
      .boolean()
      .optional()
      .describe(
        "Include descendants of folder; defaults to true. False counts or lists only direct children."
      ),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
  })
  .strict()
export const toolSchemas = {
  listFacets: z.object({ intent }).strict(),
  countDocuments: z.object({ filter: filterSchema, intent }).strict(),
  displayDocuments: z
    .object({ ids: z.array(z.string().min(1).max(100)).min(1).max(12), intent })
    .strict(),
  findDocuments: z
    .object({
      filter: filterSchema,
      intent,
      offset: z.number().int().min(0).max(100000).default(0),
      limit: z.number().int().min(1).max(20).default(10),
      sort: z.enum(["newest", "oldest", "name"]).default("newest"),
    })
    .strict(),
  searchPassages: z
    .object({
      query: z.string().trim().min(1).max(2000),
      filter: filterSchema,
      mode: z.enum(["text", "semantic", "hybrid"]).default("hybrid"),
      intent,
    })
    .strict(),
  readDocument: z
    .object({
      id: z.string().min(1).max(100),
      intent,
      offset: z.number().int().min(0).max(160000).default(0),
      length: z.number().int().min(1).max(8000).default(6000),
    })
    .strict(),
}
