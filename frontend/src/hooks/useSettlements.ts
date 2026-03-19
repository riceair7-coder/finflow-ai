import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settlementsApi } from '../api/settlements'

export function useSettlements(params?: { page?: number; status?: string }) {
  return useQuery({
    queryKey: ['settlements', params],
    queryFn: () => settlementsApi.list(params),
    select: (res) => res.data,
  })
}

export function useApproveSettlement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      settlementsApi.approve(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements'] }),
  })
}

export function useRejectSettlement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      settlementsApi.reject(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements'] }),
  })
}
