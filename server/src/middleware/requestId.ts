import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  req.id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : nanoid(12);
  res.setHeader("x-request-id", req.id);
  next();
}
