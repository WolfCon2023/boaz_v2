import { Link, useNavigate } from 'react-router-dom'

export default function LegalTerms() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">BOAZ-OS Terms of Service</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
          >
            Back
          </button>
          <Link
            to="/"
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
          >
            Home
          </Link>
        </div>
      </div>
      <header className="space-y-2">
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          These Terms of Service are a template and should be reviewed by legal counsel before being treated as a final legal document.
        </p>
      </header>

      <section className="space-y-3">
        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>1. Acceptance of terms</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
              By accessing or using BOAZ-OS Version 2, you agree to these Terms of Service.
              If you do not agree, you must not use the service.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>2. Use of the service</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
              BOAZ-OS is provided for business use by customers of Wolf Consulting Group, LLC.
              You agree to use the service only for lawful purposes and in accordance with any applicable service or subscription agreement.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>3. Accounts and security</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
              You are responsible for keeping your account credentials secure and for all actions taken using your credentials.
              Notify Wolf Consulting Group, LLC immediately if you suspect unauthorized access to your account.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>4. Service availability</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
              While Wolf Consulting Group, LLC intends for BOAZ-OS to be available and reliable, there may be times when the service is
              unavailable due to maintenance, upgrades, or events beyond our control. We are not responsible for downtime or data inaccessibility.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>5. Data and privacy</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
              Your use of BOAZ-OS is also governed by the BOAZ-OS Privacy Policy. You are responsible for ensuring that your own use of BOAZ-OS
              with customer or employee data complies with applicable privacy and data protection laws.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>6. Prohibited activities</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
              Users must not:
            </p>
            <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
              <li>Attempt to interfere with the security or integrity of BOAZ-OS.</li>
              <li>Use BOAZ-OS to distribute malware, spam, or illegal content.</li>
              <li>Access, or attempt to access, other users&apos; data without authorization.</li>
            </ul>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>7. Modifications to the service or terms</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
              Wolf Consulting Group, LLC may modify BOAZ-OS or these Terms of Service from time to time.
              If you continue using BOAZ-OS after changes take effect, you are agreeing to the updated terms.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>8. Termination</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
              Wolf Consulting Group, LLC may suspend or terminate your access to BOAZ-OS if you violate these Terms or if access is otherwise
              discontinued under a separate agreement.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>9. Disclaimers and limitation of liability</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
              Use of BOAZ-OS is at your own risk. The service is provided "as is" and "as available," without warranties of any kind.
              Wolf Consulting Group, LLC is not liable for indirect or consequential damages, and its total liability is limited as described in the EULA.
            </p>
          </div>
        </details>

        <details className="group rounded-lg bg-[color:var(--color-muted)]/30 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span>10. Contact</span>
            <span className="text-xs text-[color:var(--color-text-muted)] transition-transform group-open:rotate-180">⌃</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
              For questions about these Terms, contact{' '}
              <a href="mailto:support@wolfconsultingnc.com" className="text-[color:var(--color-primary-600)] hover:underline">
                support@wolfconsultingnc.com
              </a>
              .
            </p>
          </div>
        </details>
      </section>
    </div>
  )
}


