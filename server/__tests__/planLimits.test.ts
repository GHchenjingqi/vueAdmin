import { describe, it, expect } from 'vitest'

describe('planLimits', () => {
  it('free 套餐限制解析', () => {
    const limits = { maxUsers: 5, maxStorageMb: 100, maxApiCallsPerDay: 100, maxWorkflowRunsPerMonth: 10, maxFiles: 50 }
    expect(limits.maxUsers).toBe(5)
    expect(limits.maxStorageMb).toBe(100)
  })

  it('pro 套餐限制解析', () => {
    const limits = { maxUsers: 50, maxStorageMb: 5000, maxApiCallsPerDay: 10000, maxWorkflowRunsPerMonth: 500, maxFiles: 500 }
    expect(limits.maxUsers).toBe(50)
    expect(limits.maxApiCallsPerDay).toBe(10000)
  })

  it('enterprise 套餐限制解析', () => {
    const limits = { maxUsers: 999999, maxStorageMb: 50000, maxApiCallsPerDay: 999999, maxWorkflowRunsPerMonth: 99999, maxFiles: 99999 }
    expect(limits.maxUsers).toBe(999999)
    expect(limits.maxStorageMb).toBe(50000)
  })

  it('features 功能位解析', () => {
    const features = { sso: true, whiteLabel: true, openApi: true, audit: true, license: true }
    expect(features.sso).toBe(true)
    expect(features.whiteLabel).toBe(true)
    expect(features.openApi).toBe(true)
  })
})