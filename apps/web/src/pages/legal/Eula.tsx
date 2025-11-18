import { Link } from 'react-router-dom'

export default function LegalEula() {
  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">BOAZ-OS End User License Agreement (EULA)</h1>
        <Link
          to="/"
          className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
        >
          Back to Home
        </Link>
      </div>
      <header className="space-y-2">
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          This End User License Agreement is a template and is provided for general informational purposes.
          It should be reviewed by legal counsel before being treated as a final legal document.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. License grant</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
          Subject to your compliance with this Agreement, Wolf Consulting Group, LLC grants you a limited, non exclusive,
          non transferable, non sublicensable license to access and use BOAZ-OS Version 2 solely for your internal business purposes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Ownership</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
          BOAZ-OS, including all software, code, interfaces, visual elements, workflows, and documentation, is owned by
          Wolf Consulting Group, LLC and is protected by copyright and other intellectual property laws. You receive a
          license to use the product, not ownership of the product.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Restrictions</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
          You agree not to:
        </p>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
          <li>Copy, modify, or create derivative works of BOAZ-OS except as expressly permitted in writing by Wolf Consulting Group, LLC.</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of BOAZ-OS except to the extent that applicable law permits it despite this limitation.</li>
          <li>Rent, lease, sell, sublicense, or otherwise transfer your access to BOAZ-OS to any third party.</li>
          <li>Use BOAZ-OS in violation of any applicable law or regulation.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. User data and access</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
          You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.
          You are responsible for the accuracy of any data entered into BOAZ-OS.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Updates and changes</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
          Wolf Consulting Group, LLC may update, enhance, or modify BOAZ-OS from time to time. Some updates may be applied automatically.
          Continued use of BOAZ-OS after an update constitutes acceptance of the updated version.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Term and termination</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
          This Agreement remains in effect for as long as you have authorized access to BOAZ-OS.
          Wolf Consulting Group, LLC may suspend or terminate your access if you violate this Agreement or if access is otherwise
          discontinued under a separate service or subscription agreement. Upon termination, your license to use BOAZ-OS ends and you
          must stop all use of the software.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. No warranty</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text)]">
          BOAZ-OS is provided on an "as is" and "as available" basis. Wolf Consulting Group, LLC disclaims all warranties, whether express or implied,
          including any implied warranties of merchantability, fitness for a particular purpose, and non infringement.
          You are responsible for determining whether BOAZ-OS is suitable for your intended use.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">8. Limitation of liability</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          To the maximum extent permitted by law, Wolf Consulting Group, LLC is not liable for any indirect, incidental, consequential, special,
          or punitive damages, or for any loss of profits or revenue, even if advised of the possibility of such damages.
          The total liability of Wolf Consulting Group, LLC for any claim arising out of or relating to this Agreement or BOAZ-OS is limited to
          the amount you paid, if any, for access to BOAZ-OS in the twelve months preceding the event giving rise to the claim.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">9. Governing law</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          This Agreement is governed by the laws of the State of North Carolina, United States of America, without regard to its conflict of law principles.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">10. Contact</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          For questions about this Agreement, contact Wolf Consulting Group, LLC at{' '}
          <a href="mailto:support@wolfconsultingnc.com" className="text-[color:var(--color-primary-600)] hover:underline">
            support@wolfconsultingnc.com
          </a>
          .
        </p>
      </section>
    </div>
  )
}


