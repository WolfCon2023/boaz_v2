import { CRMNav } from '@/components/CRMNav'

export default function CRMSurveysHelp() {
  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="px-4 pb-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">Understanding NPS, CSAT, and Post‑Interaction Surveys</h1>
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
            This article explains the core survey types supported in BOAZ Surveys &amp; Feedback, how they are
            calculated, and when to use each one.
          </p>
        </div>

        <section className="mb-6 space-y-2">
          <h2 className="text-lg font-semibold">1. NPS – Net Promoter Score</h2>
          <p className="text-sm text-[color:var(--color-text)]">
            <strong>What it measures:</strong> customer loyalty and their likelihood to recommend your product or service.
          </p>
          <p className="text-sm text-[color:var(--color-text)]">
            Customers are asked a single question on a 0–10 scale:
          </p>
          <blockquote className="border-l-2 border-[color:var(--color-border)] pl-3 text-sm italic text-[color:var(--color-text-muted)]">
            &ldquo;How likely are you to recommend us to a friend or colleague?&rdquo;
          </blockquote>
          <p className="text-sm text-[color:var(--color-text)]">Responses are grouped into three segments:</p>
          <ul className="list-disc pl-5 text-sm text-[color:var(--color-text)]">
            <li><strong>Promoters (9–10):</strong> very satisfied, likely to recommend</li>
            <li><strong>Passives (7–8):</strong> satisfied but not enthusiastic</li>
            <li><strong>Detractors (0–6):</strong> unhappy, may share negative feedback</li>
          </ul>
          <p className="text-sm text-[color:var(--color-text)]">
            <strong>Formula:</strong>{' '}
            <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5">
              NPS = % Promoters – % Detractors
            </code>
          </p>
          <p className="text-sm text-[color:var(--color-text)]">
            NPS is best for measuring overall sentiment over time (e.g. quarterly programs) rather than a single
            interaction.
          </p>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-lg font-semibold">2. CSAT – Customer Satisfaction Score</h2>
          <p className="text-sm text-[color:var(--color-text)]">
            <strong>What it measures:</strong> satisfaction with a <em>specific</em> interaction, experience, product, or
            service.
          </p>
          <p className="text-sm text-[color:var(--color-text)]">
            A common question is:
          </p>
          <blockquote className="border-l-2 border-[color:var(--color-border)] pl-3 text-sm italic text-[color:var(--color-text-muted)]">
            &ldquo;How satisfied were you with your experience?&rdquo;
          </blockquote>
          <p className="text-sm text-[color:var(--color-text)]">
            CSAT usually uses a 1–5 or 1–7 scale (or stars ⭐⭐⭐⭐⭐). You choose what counts as a &ldquo;positive&rdquo;
            response (e.g. 4–5).
          </p>
          <p className="text-sm text-[color:var(--color-text)]">
            <strong>Formula:</strong>{' '}
            <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5">
              CSAT = (Total positive responses ÷ Total responses) × 100
            </code>
          </p>
          <p className="text-sm text-[color:var(--color-text)]">
            CSAT is ideal for support tickets, onboarding flows, checkout, and any other single touchpoint you want to
            monitor.
          </p>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-lg font-semibold">3. Post‑Interaction Surveys</h2>
          <p className="text-sm text-[color:var(--color-text)]">
            Post‑interaction surveys are sent immediately after a customer interaction so feedback is captured while the
            experience is still fresh.
          </p>
          <p className="text-sm text-[color:var(--color-text)]">Common triggers include:</p>
          <ul className="list-disc pl-5 text-sm text-[color:var(--color-text)]">
            <li>After a support ticket is resolved or closed</li>
            <li>After a sales demo or call</li>
            <li>After a live chat session</li>
            <li>After a service appointment or delivery</li>
          </ul>
          <p className="text-sm text-[color:var(--color-text)]">Typical questions include:</p>
          <ul className="list-disc pl-5 text-sm text-[color:var(--color-text)]">
            <li>&ldquo;How satisfied are you with the agent who helped you?&rdquo;</li>
            <li>&ldquo;Was your issue resolved?&rdquo;</li>
            <li>&ldquo;How easy was it to get help today?&rdquo;</li>
          </ul>
          <p className="text-sm text-[color:var(--color-text)]">
            These are often CSAT‑style surveys, but you can also mix in open‑ended questions to capture rich feedback on
            people, processes, and quality.
          </p>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-lg font-semibold">How BOAZ Surveys &amp; Feedback uses these metrics</h2>
          <p className="text-sm text-[color:var(--color-text)]">
            In the <strong>Surveys &amp; Feedback</strong> app you create <em>survey programs</em> that represent ongoing
            NPS, CSAT, or post‑interaction campaigns. Each program controls:
          </p>
          <ul className="list-disc pl-5 text-sm text-[color:var(--color-text)]">
            <li><strong>Type:</strong> NPS, CSAT, or Post‑interaction</li>
            <li><strong>Channel:</strong> email, in‑app, or link‑based surveys</li>
            <li><strong>Status:</strong> draft, active, or paused</li>
            <li><strong>Audience:</strong> who should receive the survey and when</li>
          </ul>
          <p className="text-sm text-[color:var(--color-text)]">
            Over time you can compare programs by response rate, scores, and trends to understand how loyalty and
            satisfaction change across segments, products, and teams.
          </p>
        </section>

        <section className="mb-2 space-y-2">
          <h2 className="text-lg font-semibold">Quick summary</h2>
          <ul className="list-disc pl-5 text-sm text-[color:var(--color-text)]">
            <li><strong>NPS</strong> → long‑term loyalty and likelihood to recommend.</li>
            <li><strong>CSAT</strong> → satisfaction with a specific interaction or experience.</li>
            <li>
              <strong>Post‑interaction surveys</strong> → short, timely feedback after a ticket, call, or appointment.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}


