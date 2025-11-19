import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'

type RelatedType = 'contact' | 'account' | 'deal' | 'invoice' | 'quote'

type RelatedTask = {
  _id: string
  subject: string
  status: string
  dueAt?: string | null
}

type RelatedTasksResponse = {
  data: {
    items: RelatedTask[]
  }
}

type Props = {
  relatedType: RelatedType
  relatedId: string
}

export function RelatedTasks({ relatedType, relatedId }: Props) {
  const qc = useQueryClient()
  const toast = useToast()

  const { data, isFetching } = useQuery<RelatedTasksResponse>({
    queryKey: ['related-tasks', relatedType, relatedId],
    queryFn: async () => {
      const res = await http.get('/api/crm/tasks', {
        params: {
          relatedType,
          relatedId,
          sort: 'dueAt',
          dir: 'asc',
          mine: 'all',
          limit: 20,
          page: 0,
        },
      })
      return res.data as RelatedTasksResponse
    },
  })

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.post(`/api/crm/tasks/${id}/complete`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['related-tasks', relatedType, relatedId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.showToast('Task marked as completed.', 'success')
    },
  })

  const create = useMutation({
    mutationFn: async (payload: { subject: string }) => {
      const res = await http.post('/api/crm/tasks', {
        type: 'todo',
        subject: payload.subject,
        status: 'open',
        priority: 'normal',
        relatedType,
        relatedId,
      })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['related-tasks', relatedType, relatedId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.showToast('Task created.', 'success')
    },
  })

  const [subject, setSubject] = React.useState('')

  const items = data?.data.items ?? []

  return (
    <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Tasks &amp; Activities</div>
        {isFetching && <div className="text-[11px] text-[color:var(--color-text-muted)]">Loading…</div>}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short description…"
          className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={!subject.trim() || create.isPending}
          className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
          onClick={() => {
            if (!subject.trim()) return
            create.mutate({ subject: subject.trim() })
            setSubject('')
          }}
        >
          Add
        </button>
      </div>

      {items.length === 0 && !isFetching && (
        <div className="text-[11px] text-[color:var(--color-text-muted)]">No tasks yet for this record.</div>
      )}

      {items.length > 0 && (
        <ul className="space-y-1 text-[11px]">
          {items.map((t) => (
            <li key={t._id} className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">{t.subject}</span>
                <span className="text-[color:var(--color-text-muted)]">
                  {t.status}{t.dueAt ? ` • Due ${formatDateTime(t.dueAt)}` : ''}
                </span>
              </div>
              {t.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => complete.mutate(t._id)}
                  disabled={complete.isPending}
                  className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-[10px] hover:bg-[color:var(--color-muted)]"
                >
                  Mark done
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


