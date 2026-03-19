import { apiClient } from './client'

export interface DashboardSummary {
  monthly_total: number
  monthly_change_pct: number
  pending_settlement_count: number
  pending_settlement_amount: number
  ar_amount: number
  ar_count: number
  overdue_count: number
  approved_settlement_count: number
  approved_settlement_amount: number
  ai_classified_pct: number
  ai_pending_pct: number
}

export interface CashflowData {
  month: string
  total: number
}

export interface ExpenseData {
  account_code: string
  total: number
  count: number
}

export const reportsApi = {
  summary: () =>
    apiClient.get<{ success: boolean; data: DashboardSummary }>('/api/v1/reports/summary'),

  cashflow: (startDate: string, endDate: string) =>
    apiClient.get<{ success: boolean; data: { cashflow: CashflowData[] } }>('/api/v1/reports/cashflow', {
      params: { start_date: startDate, end_date: endDate },
    }),

  expense: (startDate: string, endDate: string) =>
    apiClient.get<{ success: boolean; data: { expenses: ExpenseData[] } }>('/api/v1/reports/expense', {
      params: { start_date: startDate, end_date: endDate },
    }),
}
