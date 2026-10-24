import request from '@/utils/request'

export function getUsage(metric: string) {
  return request.get<{ metric: string; used: number; limit: number }>(`/billing/usage/${metric}`)
}

export function getSubscription() {
  return request.get<{ subscription: unknown; plan: unknown }>('/billing/subscription')
}

export function getPlans() {
  return request.get<unknown[]>('/billing/plans')
}

export function subscribe(planId: number) {
  return request.post<{ message: string }>('/billing/subscribe', { planId })
}
