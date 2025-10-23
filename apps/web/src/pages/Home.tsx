import { useQuery } from '@tanstack/react-query'
import type { HealthResponse } from '@boaz/shared'
import { Button } from '@boaz/ui'
import { Card, CardContent, CardHeader } from '@boaz/ui'
import { Badge } from '@boaz/ui'
import { Rocket } from 'lucide-react'

export default function Home() {
  const { data: health, isLoading, error } = useQuery<{ data: HealthResponse } | HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health')
      return res.json()
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold inline-flex items-center gap-2">
        <Rocket className="w-5 h-5" /> Welcome
      </h1>
      <p className="text-[color:var(--color-text-muted)]">Project scaffold is ready.</p>

      <div className="flex items-center gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="link">Link</Button>
        <Badge tone="info">Beta</Badge>
      </div>

      <Card>
        <CardHeader className="font-medium">API health</CardHeader>
        <CardContent className="text-sm">
          {error && <div className="text-red-600">{String(error)}</div>}
          {isLoading && <div className="text-[color:var(--color-text-muted)]">Loading...</div>}
          {health && (
            <pre className="text-xs bg-[color:var(--color-muted)] p-2 rounded overflow-auto">{JSON.stringify(health, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


