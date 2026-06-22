import { z } from 'zod';

export const ArticleSchema = z.object({
  title: z.string().min(1),
  textContent: z.string().min(50),
  url: z.string().url(),
});

export type Article = z.infer<typeof ArticleSchema>;
