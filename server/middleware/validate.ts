import { Request, Response, NextFunction } from 'express'
import { ZodType, ZodError } from 'zod'

type ValidationTarget = 'body' | 'query' | 'params'

/**
 * Zod 校验中间件工厂函数
 * @param schema Zod schema
 * @param target 校验目标: body | query | params
 */
export function validate(schema: ZodType, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target])
      req[target] = parsed
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
        next(Object.assign(new Error(message), { statusCode: 400 }))
      } else {
        next(err)
      }
    }
  }
}