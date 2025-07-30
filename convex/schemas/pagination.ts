import z from "zod";

export const paginatedInputSchema = z.object({
  cursor: z.string().optional(),
  numItems: z.number(),
});

export type PaginatedInput = z.infer<typeof paginatedInputSchema>;
