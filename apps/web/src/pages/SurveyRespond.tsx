import * as React from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { AlertCircle, CheckCircle } from 'lucide-react'

type PublicSurveyProgram = {
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
  scaleHelpText: string | null
  questions: Array<{ id: string; label: string; required: boolean }>
}

export default function SurveyRespond() {
  const { token } = useParams<{ token: string }>()
  const [scores, setScores] = React.useState<Record<string, string>>({})
  const [comment, setComment] = React.useState('')
  const [submitted, setSubmitted] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['survey-respond', token],
    enabled: !!token,
    queryFn: async () => {
      const res = await http.get(`/api/crm/surveys/respond/${token}`)
      return res.data as { data: { program: PublicSurveyProgram } }
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      if (!data?.data.program) return
      const program = data.data.program
      const answers: { questionId: string; score: number }[] = []
      for (const q of program.questions) {
        const raw = scores[q.id]
        if (!raw) {
          if (q.required) {
            throw new Error(`Please provide a score for "${q.label}".`)
          }
          continue
        }
        const n = Number(raw)
        if (Number.isNaN(n) || n < 0 || n > 10) {
          throw new Error(`Score for "${q.label}" must be between 0 and 10.`)
        }
        answers.push({ questionId: q.id, score: n })
      }
      if (answers.length === 0) {
        throw new Error('Please provide at least one score.')
      }
      const body: any = { answers }
      if (comment.trim()) body.comment = comment.trim()
      const res = await http.post(`/api/crm/surveys/respond/${token}`, body)
      return res.data
    },
    onSuccess: () => {
      setSubmitted(true)
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading survey...</p>
        </div>
      </div>
    )
  }

  if (error || !data?.data.program) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Survey Not Found</h1>
          <p className="text-gray-600 mb-4">The survey link is invalid or has expired.</p>
          <p className="text-sm text-gray-500">Please contact the sender for a new link.</p>
        </div>
      </div>
    )
  }

  const program = data.data.program

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thank you for your feedback</h1>
          <p className="text-gray-600 mb-2">
            Your responses have been recorded and will help us improve your experience.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{program.name}</h1>
          <p className="text-sm text-gray-600 mb-2">
            Please rate the following on a scale from 0 to 10.
          </p>
          {program.scaleHelpText && (
            <p className="text-xs text-gray-500">Scale: {program.scaleHelpText}</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="space-y-4">
            {program.questions.map((q) => (
              <div key={q.id} className="border-b border-gray-100 pb-3">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {q.label}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={scores[q.id] ?? ''}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0–10"
                  />
                  <span className="text-xs text-gray-500">0 = low, 10 = high</span>
                </div>
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Comments (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Share any additional feedback..."
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await submit.mutateAsync()
                  } catch (e: any) {
                    alert(e?.message || 'Failed to submit survey. Please try again.')
                  }
                }}
                disabled={submit.isPending}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submit.isPending ? 'Submitting…' : 'Submit feedback'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


