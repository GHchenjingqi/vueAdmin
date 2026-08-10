import { Parser } from 'expr-eval'

const parser = new Parser()

export function evaluateCondition(expr: string, vars: Record<string, any>): boolean {
  try {
    const result = parser.parse(expr).evaluate(vars)
    return result === true
  } catch {
    return false
  }
}