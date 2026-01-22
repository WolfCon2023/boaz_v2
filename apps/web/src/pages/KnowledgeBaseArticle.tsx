import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'

type Article = {
  _id: string
  title?: string
  body?: string
  tags?: string[]
  category?: string
  updatedAt?: string
  attachments?: { _id: string; filename: string; contentType?: string; size?: number }[]
}

function renderMarkdownLite(md: string) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []

  let i = 0
  let inCode = false
  let codeLang = ''
  let codeLines: string[] = []

  const flushCode = () => {
    if (!codeLines.length) return
    const code = codeLines.join('\n')
    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="overflow-x-auto rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-xs"
      >
        <code data-lang={codeLang}>{code}</code>
      </pre>,
    )
    codeLines = []
    codeLang = ''
  }

  const flushParagraph = (buf: string[]) => {
    const text = buf.join('\n').trim()
    if (!text) return
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-6 whitespace-pre-wrap">
        {text}
      </p>,
    )
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // Code fences
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      if (!inCode) {
        inCode = true
        codeLang = (fence[1] || '').trim()
        codeLines = []
      } else {
        inCode = false
        flushCode()
      }
      i++
      continue
    }

    if (inCode) {
      codeLines.push(line)
      i++
      continue
    }

    // HR
    if (line.trim() === '---') {
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-[color:var(--color-border)]" />)
      i++
      continue
    }

    // Headings
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const text = (h[2] || '').trim()
      const cls =
        level === 1 ? 'text-xl font-semibold' : level === 2 ? 'text-base font-semibold' : 'text-sm font-semibold'
      const Comp = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as any
      blocks.push(
        <Comp key={`h-${blocks.length}`} className={`${cls} mt-2`}>
          {text}
        </Comp>,
      )
      i++
      continue
    }

    // Lists (bullet or numbered)
    const bullet = line.match(/^\s*-\s+(.*)$/)
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet || numbered) {
      const isNumbered = Boolean(numbered)
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        const b = l.match(/^\s*-\s+(.*)$/)
        const n = l.match(/^\s*\d+\.\s+(.*)$/)
        if (isNumbered ? !n : !b) break
        items.push(((isNumbered ? n?.[1] : b?.[1]) || '').trim())
        i++
      }
      const List = (isNumbered ? 'ol' : 'ul') as any
      blocks.push(
        <List
          key={`list-${blocks.length}`}
          className={`${isNumbered ? 'list-decimal' : 'list-disc'} ml-5 text-sm space-y-1`}
        >
          {items.map((t, idx) => (
            <li key={idx} className="leading-6">
              {t}
            </li>
          ))}
        </List>,
      )
      continue
    }

    // Paragraphs (merge until blank)
    if (!line.trim()) {
      i++
      continue
    }
    const buf: string[] = []
    while (i < lines.length && (lines[i] ?? '').trim() !== '') {
      buf.push(lines[i] ?? '')
      i++
    }
    flushParagraph(buf)
  }

  // In case file ends while in code fence (rare)
  if (inCode) flushCode()

  return <div className="space-y-3">{blocks}</div>
}

export default function KnowledgeBaseArticle() {
  const { idOrSlug = '' } = useParams()

  const q = useQuery({
    queryKey: ['kb', 'article', idOrSlug],
    queryFn: async () => (await http.get(`/api/crm/support/kb/${encodeURIComponent(idOrSlug)}`)).data as { data: { item: Article } },
    enabled: Boolean(idOrSlug),
    retry: false,
  })

  const item = (q.data as any)?.data?.item as Article | undefined

  return (
    <div className="space-y-4">
      <CRMNav />

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-[color:var(--color-text-muted)]">
            <Link className="underline hover:text-[color:var(--color-text)]" to="/apps/crm/support/kb">
              Knowledge Base
            </Link>{' '}
            <span className="mx-1">/</span>
            <span className="truncate">{idOrSlug}</span>
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold">{item?.title || 'Knowledge Base Article'}</h1>
        </div>
        <Link
          to="/apps/crm/support/kb"
          className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
        >
          Back to KB
        </Link>
      </div>

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        {q.isLoading ? (
          <div className="text-sm text-[color:var(--color-text-muted)]">Loading…</div>
        ) : q.isError || !item ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Article not found</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              This article may not be seeded yet, or the slug may be incorrect.
            </div>
            <div className="text-xs">
              Try seeding from <code className="rounded bg-[color:var(--color-bg)] px-1.5 py-0.5">/admin/seed-data</code>.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
              {item.category ? <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5">{item.category}</span> : null}
              {(item.tags || []).map((t) => (
                <span key={t} className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5">
                  {t}
                </span>
              ))}
              {item.updatedAt ? <span className="ml-auto">Updated: {new Date(item.updatedAt).toLocaleString()}</span> : null}
            </div>

            {renderMarkdownLite(item.body || '')}

            {(item.attachments || []).length ? (
              <div className="pt-2 border-t border-[color:var(--color-border)]">
                <div className="text-sm font-semibold mb-2">Attachments</div>
                <div className="space-y-2">
                  {(item.attachments || []).map((att) => (
                    <a
                      key={att._id}
                      href={`/api/crm/support/kb/${encodeURIComponent(item._id)}/attachments/${encodeURIComponent(att._id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    >
                      {att.filename}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

