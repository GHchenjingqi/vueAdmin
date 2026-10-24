import { AsyncLocalStorage } from 'node:async_hooks'

export interface TenantContext {
  tenantId: number | null
  bypass?: boolean
  userId?: number
}

export const tenantALS = new AsyncLocalStorage<TenantContext>()

export function runInTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantALS.run(ctx, fn)
}

export function getTenantContext(): TenantContext | undefined {
  return tenantALS.getStore()
}
