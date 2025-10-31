import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { http } from '@/lib/http'

export default function Enroll() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [email, setEmail] = useState<string>('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  
  const [securityQuestions, setSecurityQuestions] = useState([
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
  ])
  
  useEffect(() => {
    if (!token) {
      setError('Invalid enrollment link. Please check your email for the correct link.')
      setVerifying(false)
      return
    }
    
    // Verify token and get email
    http.get('/api/auth/enroll/verify', { params: { token } })
      .then((res) => {
        setEmail(res.data.email)
        setVerifying(false)
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Invalid or expired enrollment link. Please request a new one.')
        setVerifying(false)
      })
  }, [token])
  
  const updateQuestion = (index: number, field: 'question' | 'answer', value: string) => {
    setSecurityQuestions((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    
    // Validate all questions are filled
    const allFilled = securityQuestions.every((sq) => sq.question.trim() && sq.answer.trim())
    if (!allFilled) {
      setError('Please provide all 3 security questions and answers.')
      return
    }
    
    setLoading(true)
    try {
      await http.post('/api/auth/enroll/complete', {
        token,
        securityQuestions: securityQuestions.map((sq) => ({
          question: sq.question.trim(),
          answer: sq.answer.trim(),
        })),
      })
      setMessage('Account setup completed successfully! Redirecting to login...')
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to complete account setup. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-background)] p-4">
        <div className="w-full max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 shadow-lg">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--color-primary-600)] border-t-transparent"></div>
            <p className="text-sm text-[color:var(--color-text-muted)]">Verifying enrollment link...</p>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-background)] p-4">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-2xl font-semibold">Complete Your Account Setup</h1>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Set up 3 security questions to enable account recovery for <strong>{email}</strong>
          </p>
        </div>
        
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
        
        <form onSubmit={handleSubmit} className="space-y-6">
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
                  disabled={loading}
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
                  disabled={loading}
                />
              </div>
            </div>
          ))}
          
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
          >
            {loading ? 'Setting up...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  )
}

