import { runInTenant } from '../context.js'
import { NextFunction, Request, Response } from 'express'

export function tenantContext(req: Request, res: Response, next: NextFunction) {
  const ctx = {
    tenantId: (req.user as any)?.tenantId ?? null,
    bypass: (req.user as any)?.isPlatformAdmin === true,
    userId: (req.user as any)?.id,
  }
  runInTenant(ctx, () => next())
}
