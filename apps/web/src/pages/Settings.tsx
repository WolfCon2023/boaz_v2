import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings as SettingsIcon, Shield, User } from 'lucide-react'
import { http } from '@/lib/http'

type UserInfo = {
  id: string
  email: string
  name?: string
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile')
  
  const { data: userData } = useQuery<UserInfo>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me')
      return res.data
    },
  })
  
  const [securityQuestions, setSecurityQuestions] = useState([
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
  ])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  
  const updateSecurityQuestions = useMutation({
    mutationFn: async (payload: { securityQuestions: Array<{ question: string; answer: string }> }) => {
      const res = await http.put('/api/auth/me/security-questions', payload)
      return res.data
    },
    onSuccess: () => {
      setMessage('Security questions updated successfully!')
      setError('')
      setSecurityQuestions([
        { question: '', answer: '' },
        { question: '', answer: '' },
        { question: '', answer: '' },
      ])
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to update security questions')
      setMessage('')
    },
  })
  
  const handleSecuritySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    
    // Validate all questions are filled
    const allFilled = securityQuestions.every((sq) => sq.question.trim() && sq.answer.trim())
    if (!allFilled) {
      setError('Please provide all 3 security questions and answers.')
      return
    }
    
    updateSecurityQuestions.mutate({
      securityQuestions: securityQuestions.map((sq) => ({
        question: sq.question.trim(),
        answer: sq.answer.trim(),
      })),
    })
  }
  
  const updateQuestion = (index: number, field: 'question' | 'answer', value: string) => {
    setSecurityQuestions((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-[color:var(--color-border)]">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'profile'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <User className="h-4 w-4" />
          Profile
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'security'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Shield className="h-4 w-4" />
          Security
        </button>
      </div>
      
      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h2 className="mb-4 text-lg font-semibold">Profile Information</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm text-[color:var(--color-text-muted)]">
                {userData?.email || '—'}
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Your email address cannot be changed.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm text-[color:var(--color-text-muted)]">
                {userData?.name || '—'}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h2 className="mb-4 text-lg font-semibold">Security Questions</h2>
          <p className="mb-6 text-sm text-[color:var(--color-text-muted)]">
            Set or update your 3 security questions and answers. One will be randomly selected when you need to recover your username.
          </p>
          
          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          
          {message && (
            <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}
          
          <form onSubmit={handleSecuritySubmit} className="space-y-6">
            {securityQuestions.map((sq, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-[color:var(--color-border)] p-4">
                <h3 className="text-sm font-semibold">Security Question {index + 1}</h3>
                <div>
                  <label htmlFor={`question-${index}`} className="mb-1 block text-sm font-medium">
                    Question
                  </label>
                  <input
                    id={`question-${index}`}
                    type="text"
                    value={sq.question}
                    onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                    placeholder="e.g., What was the name of your first pet?"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                    required
                    disabled={updateSecurityQuestions.isPending}
                  />
                </div>
                <div>
                  <label htmlFor={`answer-${index}`} className="mb-1 block text-sm font-medium">
                    Answer
                  </label>
                  <input
                    id={`answer-${index}`}
                    type="text"
                    value={sq.answer}
                    onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
                    placeholder="Your answer"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                    required
                    disabled={updateSecurityQuestions.isPending}
                  />
                </div>
              </div>
            ))}
            
            <button
              type="submit"
              disabled={updateSecurityQuestions.isPending}
              className="mt-4 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
            >
              {updateSecurityQuestions.isPending ? 'Saving...' : 'Save Security Questions'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

