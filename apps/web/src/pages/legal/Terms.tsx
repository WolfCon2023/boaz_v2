import * as React from 'react'

export default function LegalTerms() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">BOAZ-OS Terms of Service</h1>
        <p className="max-w-3xl text-sm text-[color:var(--color-text-muted)]">
          These Terms of Service are a template and should be reviewed by legal counsel before being treated as a final legal document.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Acceptance of terms</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          By accessing or using BOAZ-OS Version 2, you agree to these Terms of Service.
          If you do not agree, you must not use the service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Use of the service</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          BOAZ-OS is provided for business use by customers of Wolf Consulting Group, LLC.
          You agree to use the service only for lawful purposes and in accordance with any applicable service or subscription agreement.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Accounts and security</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          You are responsible for keeping your account credentials secure and for all actions taken using your credentials.
          Notify Wolf Consulting Group, LLC immediately if you suspect unauthorized access to your account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Service availability</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          While Wolf Consulting Group, LLC intends for BOAZ-OS to be available and reliable, there may be times when the service is
          unavailable due to maintenance, upgrades, or events beyond our control. We are not responsible for downtime or data inaccessibility.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Data and privacy</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Your use of BOAZ-OS is also governed by the BOAZ-OS Privacy Policy. You are responsible for ensuring that your own use of BOAZ-OS
          with customer or employee data complies with applicable privacy and data protection laws.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Prohibited activities</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Users must not:
        </p>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
          <li>Attempt to interfere with the security or integrity of BOAZ-OS.</li>
          <li>Use BOAZ-OS to distribute malware, spam, or illegal content.</li>
          <li>Access, or attempt to access, other users&apos; data without authorization.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. Modifications to the service or terms</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Wolf Consulting Group, LLC may modify BOAZ-OS or these Terms of Service from time to time.
          If you continue using BOAZ-OS after changes take effect, you are agreeing to the updated terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">8. Termination</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Wolf Consulting Group, LLC may suspend or terminate your access to BOAZ-OS if you violate these Terms or if access is otherwise
          discontinued under a separate agreement.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">9. Disclaimers and limitation of liability</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Use of BOAZ-OS is at your own risk. The service is provided "as is" and "as available," without warranties of any kind.
          Wolf Consulting Group, LLC is not liable for indirect or consequential damages, and its total liability is limited as described in the EULA.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">10. Contact</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          For questions about these Terms, contact{' '}
          <a href="mailto:support@wolfconsultingnc.com" className="text-[color:var(--color-primary-600)] hover:underline">
            support@wolfconsultingnc.com
          </a>
          .
        </p>
      </section>
    </div>
  )
}


