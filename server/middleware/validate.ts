import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Validates `req.body` against a Zod schema. On success, replaces
 * `req.body` with the parsed (and coerced) data. On failure, responds
 * with 400 and a flattened error map.
 */
export const validateBody =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
