import * as React from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'

type SurveyQuestion = {
  id: string
  label: string
  required?: boolean
}

type SurveyProgram = {
  id: string
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
  channel: 'Email' | 'In‑app' | 'Link'
  status: 'Draft' | 'Active' | 'Paused'
  // Optional content fields so each program defines its question and scale guidance
  questionText?: string
  scaleHelpText?: string
  questions?: SurveyQuestion[]
  lastSentAt?: string
  responseRate?: number
}

type ProgramSummaryBase = {
  totalResponses: number
}

type ProgramSummaryNps = ProgramSummaryBase & {
  detractors: number
  passives: number
  promoters: number
  detractorsPct: number
  passivesPct: number
  promotersPct: number
  nps: number
}

type ProgramSummaryScore = ProgramSummaryBase & {
  averageScore: number
  distribution: Record<string, number>
}

type ProgramQuestionSummary = {
  questionId: string
  label: string
  averageScore: number
  responses: number
}

type ProgramSummary = (ProgramSummaryNps | ProgramSummaryScore) & {
  questions?: ProgramQuestionSummary[]
}

type ProgramMetricsRow = {
  programId: string
  name: string
  type: SurveyProgram['type']
  status: SurveyProgram['status']
  summary: ProgramSummary
}

const defaultQuestionForType = (type: SurveyProgram['type']): string => {
  if (type === 'NPS') {
    return 'On a scale from 0 to 10, how likely are you to recommend us to a friend or colleague?'
  }
  if (type === 'CSAT') {
    return 'How satisfied are you with your recent experience? (0 = Very dissatisfied, 10 = Very satisfied)'
  }
  return 'Thinking about your recent interaction, how would you rate your overall experience from 0 to 10?'
}

export default function CRMSurveys() {
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'NPS' | 'CSAT' | 'Post‑interaction'>('all')
  const [editing, setEditing] = React.useState<SurveyProgram | null>(null)
  const [showEditor, setShowEditor] = React.useState(false)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  const [selectedProgramId, setSelectedProgramId] = React.useState<string | null>(null)
  const [testScore, setTestScore] = React.useState<string>('')
  const [testComment, setTestComment] = React.useState<string>('')
  const [testAnswers, setTestAnswers] = React.useState<Record<string, string>>({})
  const toast = useToast()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalEl(document.body)
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['surveys-programs', typeFilter],
    queryFn: async () => {
      const params: any = {}
      if (typeFilter !== 'all') params.type = typeFilter
      const res = await http.get('/api/crm/surveys/programs', { params })
      const payload = res.data as {
        data: { items: Array<SurveyProgram & { _id?: string }> }
      }
      const items = payload.data.items.map((p) => ({
        ...p,
        id: (p as any)._id ?? p.id,
      }))
      return { items }
    },
  })

  const programs = data?.items ?? []
  const filteredPrograms = programs
  const selectedProgram = programs.find((p) => p.id === selectedProgramId) || null

  const activeMetricsQuery = useQuery({
    queryKey: ['surveys-programs-metrics', 'Active'],
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/programs/metrics', {
        params: { status: 'Active' },
      })
      const payload = res.data as {
        data: { items: ProgramMetricsRow[] }
      }
      return payload.data.items
    },
  })

  const summaryQuery = useQuery({
    queryKey: ['surveys-program-summary', selectedProgramId],
    enabled: !!selectedProgramId,
    queryFn: async () => {
      if (!selectedProgramId) return null
      const res = await http.get(`/api/crm/surveys/programs/${selectedProgramId}/summary`)
      const payload = res.data as { data: ProgramSummary }
      return payload.data
    },
  })

  const logResponse = useMutation({
    mutationFn: async (vars: {
      programId: string
      score?: number
      answers?: { questionId: string; score: number }[]
      comment?: string
    }) => {
      const body: any = {}
      if (typeof vars.score === 'number') {
        body.score = vars.score
      }
      if (vars.answers && vars.answers.length > 0) {
        body.answers = vars.answers
      }
      if (vars.comment && vars.comment.trim()) body.comment = vars.comment.trim()
      const res = await http.post(`/api/crm/surveys/programs/${vars.programId}/responses`, body)
      return res.data
    },
    onSuccess: () => {
      if (selectedProgramId) {
        queryClient.invalidateQueries({ queryKey: ['surveys-program-summary', selectedProgramId] })
      }
      setTestScore('')
      setTestComment('')
      setTestAnswers({})
      toast.showToast('BOAZ says: Sample response recorded.', 'success')
    },
    onError: (err: any) => {
      console.error('Log survey response error:', err)
      toast.showToast('BOAZ says: Failed to record response.', 'error')
    },
  })

  const saveProgram = useMutation({
    mutationFn: async (program: SurveyProgram) => {
      const body: any = {
        name: program.name,
        type: program.type,
        channel: program.channel,
        status: program.status,
      }

      // Normalise questions list
      const questions = (program.questions ?? [])
        .map((q, idx) => ({
          id: q.id || `q${idx + 1}`,
          label: (q.label ?? '').trim(),
          required: !!q.required,
          order: idx,
        }))
        .filter((q) => q.label.length > 0)

      if (questions.length > 0) {
        body.questions = questions
        // Keep legacy single-question fields in sync with the first question
        body.questionText = questions[0].label
      } else if (program.questionText && program.questionText.trim()) {
        body.questionText = program.questionText.trim()
      }

      if (program.scaleHelpText && program.scaleHelpText.trim()) {
        body.scaleHelpText = program.scaleHelpText.trim()
      }

      if (program.id) {
        const res = await http.put(`/api/crm/surveys/programs/${program.id}`, body)
        return res.data
      }

      const res = await http.post('/api/crm/surveys/programs', body)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys-programs'] })
      toast.showToast('BOAZ says: Survey program saved.', 'success')
      setShowEditor(false)
      setEditing(null)
    },
    onError: (err: any) => {
      console.error('Save survey program error:', err)
      toast.showToast('BOAZ says: Failed to save survey program.', 'error')
    },
  })

  const deleteProgram = useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/api/crm/surveys/programs/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys-programs'] })
      toast.showToast('Survey program deleted.', 'success')
      setShowEditor(false)
      setEditing(null)
      setSelectedProgramId(null)
    },
    onError: (err: any) => {
      console.error('Delete survey program error:', err)
      toast.showToast('Failed to delete survey program.', 'error')
    },
  })

  const openNewProgram = () => {
    const type: SurveyProgram['type'] = 'NPS'
    const defaultLabel = defaultQuestionForType(type)
    setEditing({
      id: '',
      name: '',
      type,
      channel: 'Email',
      status: 'Draft',
      questionText: defaultLabel,
      scaleHelpText: '0 = Not at all likely, 10 = Extremely likely',
      questions: [
        {
          id: 'q1',
          label: defaultLabel,
          required: true,
        },
      ],
    })
    setShowEditor(true)
  }

  const openEditProgram = (p: SurveyProgram) => {
    let questions = p.questions
    // Backwards compatibility: older programs may only have a single questionText
    if (!questions || questions.length === 0) {
      const label = p.questionText && p.questionText.trim().length > 0
        ? p.questionText
        : defaultQuestionForType(p.type)
      questions = [
        {
          id: 'q1',
          label,
          required: true,
        },
      ]
    }

    setEditing({ ...p, questions })
    setShowEditor(true)
    setSelectedProgramId(p.id)
  }

  const closeEditor = () => {
    setShowEditor(false)
    setEditing(null)
  }

  const handleEditorChange = (field: keyof SurveyProgram, value: string) => {
    if (!editing) return

    // When changing type on a brand‑new program and no questions exist yet,
    // auto-suggest a reasonable default question.
    if (field === 'type') {
      const nextType = value as SurveyProgram['type']
      const defaultLabel = defaultQuestionForType(nextType)
      const next: SurveyProgram = { ...editing, type: nextType }
      if (!next.questions || next.questions.length === 0) {
        next.questions = [
          {
            id: 'q1',
            label: defaultLabel,
            required: true,
          },
        ]
        next.questionText = defaultLabel
      }
      setEditing(next)
      return
    }

    setEditing({ ...editing, [field]: value } as SurveyProgram)
  }

  const handleSaveProgram = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return

    const trimmedName = editing.name.trim()
    if (!trimmedName) {
      // Simple guard; in future we can add nicer validation UI
      return
    }

    const withName: SurveyProgram = { ...editing, name: trimmedName }
    saveProgram.mutate(withName)
  }

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="px-4 pb-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Surveys &amp; Feedback</h1>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              Configure NPS and CSAT programs, and send post‑interaction surveys after tickets, demos, and other touchpoints.
            </p>
          </div>
          <a
            href="/apps/crm/surveys/help"
            className="inline-flex items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
          >
            Learn about NPS, CSAT &amp; post‑interaction surveys
          </a>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[color:var(--color-text)] font-medium">Filter by type:</span>
          <select
            className="rounded-md border border-[color:var(--color-border)] bg-white px-2 py-1 text-sm text-black font-semibold"
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'all' | 'NPS' | 'CSAT' | 'Post‑interaction')
            }
          >
            <option value="all">All</option>
            <option value="NPS">NPS</option>
            <option value="CSAT">CSAT</option>
            <option value="Post‑interaction">Post‑interaction</option>
          </select>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr,1.3fr]">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-md font-semibold">Survey programs</h2>
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)]"
                onClick={openNewProgram}
              >
                New survey program
              </button>
            </div>

            {isLoading ? (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                Loading survey programs…
              </p>
            ) : filteredPrograms.length === 0 ? (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                No survey programs match this filter yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className="px-2 py-1">Name</th>
                      <th className="px-2 py-1">Type</th>
                      <th className="px-2 py-1">Channel</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Last Sent</th>
                      <th className="px-2 py-1">Response Rate</th>
                      <th className="px-2 py-1 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrograms.map((p) => (
                      <tr
                        key={p.id}
                        className={`border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-muted)] ${
                          selectedProgramId === p.id ? 'bg-[color:var(--color-muted)]' : ''
                        }`}
                        onClick={() => {
                          setSelectedProgramId(p.id)
                        }}
                      >
                        <td className="px-2 py-1 font-medium">{p.name}</td>
                        <td className="px-2 py-1">{p.type}</td>
                        <td className="px-2 py-1">{p.channel}</td>
                        <td className="px-2 py-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              p.status === 'Active'
                                ? 'bg-green-100 text-green-800'
                                : p.status === 'Paused'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          {p.lastSentAt ? formatDateTime(p.lastSentAt) : '—'}
                        </td>
                        <td className="px-2 py-1">
                          {typeof p.responseRate === 'number' ? `${p.responseRate}%` : '—'}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditProgram(p)
                            }}
                            className="rounded-md border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-primary-600)] hover:bg-[color:var(--color-muted)]"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-sm">
            <h2 className="mb-2 text-md font-semibold">Program metrics</h2>
            {!selectedProgram || !selectedProgramId ? (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                Select a survey program to see NPS/CSAT metrics and log sample responses.
              </p>
            ) : summaryQuery.isLoading ? (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                Loading metrics…
              </p>
            ) : !summaryQuery.data || summaryQuery.data.totalResponses === 0 ? (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                No responses recorded yet for this program.
              </p>
            ) : selectedProgram.type === 'NPS' ? (
              <div className="space-y-2 text-sm">
                <p className="text-[color:var(--color-text)]">
                  <strong>Total responses:</strong> {summaryQuery.data.totalResponses}
                </p>
                {'nps' in summaryQuery.data && (
                  <p className="text-[color:var(--color-text)]">
                    <strong>NPS:</strong> {summaryQuery.data.nps}
                  </p>
                )}
                {'promoters' in summaryQuery.data && (
                  <ul className="list-disc pl-5 text-[color:var(--color-text)] space-y-1">
                    <li>
                      Promoters: {summaryQuery.data.promoters} (
                      {summaryQuery.data.promotersPct.toFixed(1)}%)
                    </li>
                    <li>
                      Passives: {summaryQuery.data.passives} (
                      {summaryQuery.data.passivesPct.toFixed(1)}%)
                    </li>
                    <li>
                      Detractors: {summaryQuery.data.detractors} (
                      {summaryQuery.data.detractorsPct.toFixed(1)}%)
                    </li>
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-[color:var(--color-text)]">
                  <strong>Total responses:</strong> {summaryQuery.data.totalResponses}
                </p>
                {'averageScore' in summaryQuery.data && (
                  <p className="text-[color:var(--color-text)]">
                    <strong>Average score (overall):</strong>{' '}
                    {summaryQuery.data.averageScore.toFixed(2)}
                  </p>
                )}
                {'distribution' in summaryQuery.data && (
                  <div>
                    <p className="text-[color:var(--color-text)] font-semibold">Score distribution</p>
                    <ul className="list-disc pl-5 text-[color:var(--color-text)] space-y-0.5">
                      {Object.entries(summaryQuery.data.distribution)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([score, count]) => (
                          <li key={score}>
                            Score {score}: {count}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {summaryQuery.data &&
              Array.isArray((summaryQuery.data as any).questions) &&
              (summaryQuery.data as any).questions.length > 0 && (
                <div className="mt-3 border-t border-[color:var(--color-border)] pt-3 text-xs">
                  <p className="mb-1 font-semibold text-[color:var(--color-text)]">
                    Per-question averages
                  </p>
                  <ul className="space-y-1 text-[color:var(--color-text)]">
                    {(summaryQuery.data as any).questions.map((q: ProgramQuestionSummary) => (
                      <li key={q.questionId} className="flex items-center justify-between gap-2">
                        <span className="flex-1 truncate" title={q.label}>
                          {q.label}
                        </span>
                        <span className="ml-2 whitespace-nowrap text-[color:var(--color-text-muted)]">
                          {q.averageScore.toFixed(2)} ({q.responses} responses)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {selectedProgram && (
              <div className="mt-4 border-t border-[color:var(--color-border)] pt-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  Quick sample response
                </h3>
                <p className="mb-2 text-xs text-[color:var(--color-text-muted)]">
                  Use this to log a test response while you design your program. Later, support and outreach
                  flows can call the same API automatically.
                </p>
                <div className="flex flex-col gap-2 text-sm">
                  {selectedProgram.questions && selectedProgram.questions.length > 0 ? (
                    <>
                      <p className="text-[10px] text-[color:var(--color-text-muted)] mb-1">
                        Enter a 0–10 score for each question below.
                      </p>
                      <div className="space-y-2">
                        {selectedProgram.questions.map((q) => (
                          <div key={q.id} className="flex items-center gap-2">
                            <label className="flex-1 text-xs font-medium text-[color:var(--color-text)]">
                              {q.label}
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={testAnswers[q.id] ?? ''}
                              onChange={(e) =>
                                setTestAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              className="w-20 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-2 py-1 text-xs text-[color:var(--color-text)] focus:border-[color:var(--color-primary-600)] focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-[color:var(--color-text)]">
                        Score
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={testScore}
                        onChange={(e) => setTestScore(e.target.value)}
                        className="w-20 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-2 py-1 text-xs text-[color:var(--color-text)] focus:border-[color:var(--color-primary-600)] focus:outline-none"
                      />
                      <span className="text-[color:var(--color-text-muted)] text-xs">
                        0–10 (use 0–10 for NPS, 1–5 for CSAT)
                      </span>
                    </div>
                  )}
                  <textarea
                    value={testComment}
                    onChange={(e) => setTestComment(e.target.value)}
                    rows={2}
                    placeholder="Optional comment or verbatim…"
                    className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-2 py-1 text-xs text-[color:var(--color-text)] focus:border-[color:var(--color-primary-600)] focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-60"
                      disabled={(() => {
                        if (!selectedProgramId || logResponse.isPending) return true
                        if (selectedProgram.questions && selectedProgram.questions.length > 0) {
                          // Require at least one numeric answer; in future we could enforce per-question required
                          const anyFilled = selectedProgram.questions.some((q) => {
                            const v = testAnswers[q.id]
                            return v !== undefined && v !== ''
                          })
                          return !anyFilled
                        }
                        return !testScore
                      })()}
                      onClick={() => {
                        if (!selectedProgramId) return

                        if (selectedProgram.questions && selectedProgram.questions.length > 0) {
                          const answers: { questionId: string; score: number }[] = []
                          for (const q of selectedProgram.questions) {
                            const raw = testAnswers[q.id]
                            if (raw === undefined || raw === '') continue
                            const n = Number(raw)
                            if (Number.isNaN(n)) {
                              toast.showToast(
                                `BOAZ says: Score for "${q.label}" must be a number.`,
                                'error',
                              )
                              return
                            }
                            if (n < 0 || n > 10) {
                              toast.showToast(
                                `BOAZ says: Score for "${q.label}" must be between 0 and 10.`,
                                'error',
                              )
                              return
                            }
                            answers.push({ questionId: q.id, score: n })
                          }

                          if (answers.length === 0) {
                            toast.showToast(
                              'BOAZ says: Please enter at least one question score.',
                              'error',
                            )
                            return
                          }

                          logResponse.mutate({
                            programId: selectedProgramId,
                            answers,
                            comment: testComment,
                          })
                        } else {
                          if (!testScore) return
                          const n = Number(testScore)
                          if (Number.isNaN(n)) {
                            toast.showToast('BOAZ says: Score must be a number.', 'error')
                            return
                          }
                          if (n < 0 || n > 10) {
                            toast.showToast('BOAZ says: Score must be between 0 and 10.', 'error')
                            return
                          }
                          logResponse.mutate({
                            programId: selectedProgramId,
                            score: n,
                            comment: testComment,
                          })
                        }
                      }}
                    >
                      Log sample response
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-6">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-md font-semibold">Active program metrics</h2>
            <span className="text-[10px] text-[color:var(--color-text-muted)]">
              Metrics are calculated per program from the last 1000 responses.
            </span>
          </div>
          {activeMetricsQuery.isLoading ? (
            <p className="text-sm text-[color:var(--color-text-muted)]">
              Loading active program metrics…
            </p>
          ) : !activeMetricsQuery.data || activeMetricsQuery.data.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-muted)]">
              No active survey programs with responses yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className="px-2 py-1">Program</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Total responses</th>
                    <th className="px-2 py-1">Key score</th>
                    <th className="px-2 py-1">Distribution (summary)</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMetricsQuery.data.map((row) => {
                    const s = row.summary
                    const isNps = 'nps' in s
                    let keyScore: string = '—'
                    if (isNps) {
                      keyScore = `NPS ${s.nps}`
                    } else if ('averageScore' in s) {
                      keyScore = `Avg ${s.averageScore.toFixed(2)}`
                    }

                    let distributionSummary = '—'
                    if (isNps && 'promotersPct' in s) {
                      distributionSummary = `Promoters ${s.promotersPct.toFixed(
                        1,
                      )}%, Passives ${s.passivesPct.toFixed(
                        1,
                      )}%, Detractors ${s.detractorsPct.toFixed(1)}%`
                    } else if (!isNps && 'distribution' in s) {
                      const entries = Object.entries(s.distribution)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .slice(0, 5)
                      distributionSummary = entries
                        .map(([score, count]) => `Score ${score}: ${count}`)
                        .join(' • ')
                    }

                    return (
                      <tr
                        key={row.programId}
                        className="border-b border-[color:var(--color-border)] last:border-b-0"
                      >
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            onClick={() => setSelectedProgramId(row.programId)}
                            className="text-[color:var(--color-primary-500)] hover:underline"
                          >
                            {row.name}
                          </button>
                        </td>
                        <td className="px-2 py-1">{row.type}</td>
                        <td className="px-2 py-1">{s.totalResponses}</td>
                        <td className="px-2 py-1">{keyScore}</td>
                        <td className="px-2 py-1 text-[color:var(--color-text-muted)]">
                          {distributionSummary}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showEditor && editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeEditor} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="max-h-[90vh] w-[min(90vw,40rem)] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {editing.id ? 'Edit survey program' : 'New survey program'}
                  </h2>
                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Define the survey name, type, channel, and status — plus the exact question text and scale
                    guidance your customers will see.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-[color:var(--color-border)] px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleSaveProgram}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                    Program name
                  </label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => handleEditorChange('name', e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-3 py-2 text-sm text-[color:var(--color-text)] focus:border-[color:var(--color-primary-600)] focus:outline-none"
                    placeholder="e.g. Quarterly NPS – All Customers"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text)]">
                      Type
                    </label>
                    <select
                      value={editing.type}
                      onChange={(e) =>
                        handleEditorChange('type', e.target.value as SurveyProgram['type'])
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black font-semibold"
                    >
                      <option value="NPS">NPS</option>
                      <option value="CSAT">CSAT</option>
                      <option value="Post‑interaction">Post‑interaction</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text)]">
                      Channel
                    </label>
                    <select
                      value={editing.channel}
                      onChange={(e) =>
                        handleEditorChange('channel', e.target.value as SurveyProgram['channel'])
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black font-semibold"
                    >
                      <option value="Email">Email</option>
                      <option value="In‑app">In‑app</option>
                      <option value="Link">Link</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text)]">
                      Status
                    </label>
                    <select
                      value={editing.status}
                      onChange={(e) =>
                        handleEditorChange('status', e.target.value as SurveyProgram['status'])
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black font-semibold"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Active">Active</option>
                      <option value="Paused">Paused</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text)]">
                    Scale help (optional)
                  </label>
                  <textarea
                    value={editing.scaleHelpText ?? ''}
                    onChange={(e) => handleEditorChange('scaleHelpText', e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-3 py-2 text-sm text-[color:var(--color-text)] focus:border-[color:var(--color-primary-600)] focus:outline-none"
                    placeholder="e.g. 0 = Not at all likely, 10 = Extremely likely"
                  />
                  <p className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                    Short guidance shown under the question to explain what the scale values mean.
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-[color:var(--color-text)]">
                      Questions
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!editing) return
                        const nextQuestions = [...(editing.questions ?? [])]
                        const idx = nextQuestions.length + 1
                        nextQuestions.push({
                          id: `q${idx}`,
                          label: `Question ${idx}`,
                          required: true,
                        })
                        setEditing({
                          ...editing,
                          questions: nextQuestions,
                        })
                      }}
                      className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-2 py-1 text-[10px] font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
                    >
                      Add question
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(editing.questions ?? []).map((q, idx) => (
                      <div
                        key={q.id}
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] p-2"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-[color:var(--color-text-muted)]">
                            Question {idx + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => {
                                if (!editing || idx === 0) return
                                const next = [...(editing.questions ?? [])]
                                const tmp = next[idx - 1]
                                next[idx - 1] = next[idx]
                                next[idx] = tmp
                                setEditing({ ...editing, questions: next })
                              }}
                              className="rounded border border-[color:var(--color-border)] px-1 text-[10px] disabled:opacity-40"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === (editing.questions ?? []).length - 1}
                              onClick={() => {
                                if (!editing) return
                                const next = [...(editing.questions ?? [])]
                                if (idx === next.length - 1) return
                                const tmp = next[idx + 1]
                                next[idx + 1] = next[idx]
                                next[idx] = tmp
                                setEditing({ ...editing, questions: next })
                              }}
                              className="rounded border border-[color:var(--color-border)] px-1 text-[10px] disabled:opacity-40"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              disabled={(editing.questions ?? []).length <= 1}
                              onClick={() => {
                                if (!editing) return
                                const next = (editing.questions ?? []).filter((_, i) => i !== idx)
                                setEditing({ ...editing, questions: next })
                              }}
                              className="rounded border border-red-300 px-1 text-[10px] text-red-600 disabled:opacity-40"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={q.label}
                          onChange={(e) => {
                            if (!editing) return
                            const next = [...(editing.questions ?? [])]
                            next[idx] = { ...next[idx], label: e.target.value }
                            setEditing({ ...editing, questions: next })
                          }}
                          className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-xs text-[color:var(--color-text)] focus:border-[color:var(--color-primary-600)] focus:outline-none"
                          placeholder={`Question ${idx + 1}`}
                        />
                        <label className="mt-1 inline-flex items-center gap-1 text-[10px] text-[color:var(--color-text-muted)]">
                          <input
                            type="checkbox"
                            checked={q.required ?? true}
                            onChange={(e) => {
                              if (!editing) return
                              const next = [...(editing.questions ?? [])]
                              next[idx] = { ...next[idx], required: e.target.checked }
                              setEditing({ ...editing, questions: next })
                            }}
                            className="h-3 w-3 rounded border-[color:var(--color-border)]"
                          />
                          Required
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] p-3 text-xs">
                  <p className="mb-1 font-semibold text-[color:var(--color-text)]">Preview</p>
                  <div className="space-y-3">
                    {(() => {
                      const questions = (editing.questions && editing.questions.length > 0
                        ? editing.questions
                        : [
                            {
                              id: 'q1',
                              label:
                                (editing.questionText && editing.questionText.trim().length > 0
                                  ? editing.questionText
                                  : defaultQuestionForType(editing.type)) ??
                                defaultQuestionForType(editing.type),
                            },
                          ]) as SurveyQuestion[]

                      return questions.map((q) => (
                        <div key={q.id}>
                          <p className="text-[color:var(--color-text)]">{q.label}</p>
                          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-[color:var(--color-text-muted)]">
                            {Array.from({ length: 11 }).map((_, i) => (
                              <span
                                key={i}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)]"
                              >
                                {i}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                  {editing.scaleHelpText && editing.scaleHelpText.trim().length > 0 && (
                    <p className="mt-2 text-[10px] text-[color:var(--color-text-muted)]">
                      {editing.scaleHelpText}
                    </p>
                  )}
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  {editing.id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!editing.id) return
                        if (
                          !window.confirm(
                            'Delete this survey program? This will also remove its stored responses.',
                          )
                        )
                          return
                        deleteProgram.mutate(editing.id)
                      }}
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  )}
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)]"
                    >
                      Save program
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>,
        portalEl
      )}
    </div>
  )
}


