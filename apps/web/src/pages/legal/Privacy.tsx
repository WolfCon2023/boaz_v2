export default function LegalPrivacy() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">BOAZ-OS Privacy Policy</h1>
        <p className="max-w-3xl text-sm text-[color:var(--color-text-muted)]">
          This Privacy Policy is a template and should be reviewed by legal counsel before being treated as a final legal document.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Introduction</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          BOAZ-OS is provided by Wolf Consulting Group, LLC. This Privacy Policy explains how we handle information in connection with BOAZ-OS Version 2.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Information we may collect</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Depending on how BOAZ-OS is configured and used, the system may store:
        </p>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
          <li>Account information such as names, email addresses, and roles.</li>
          <li>Business data such as customers, appointments, tasks, and notes.</li>
          <li>Technical data such as log entries, audit events, and usage metrics.</li>
        </ul>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Customer organizations are responsible for the data they choose to enter or integrate into BOAZ-OS.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. How information is used</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Information in BOAZ-OS is used to:
        </p>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
          <li>Provide and operate the application.</li>
          <li>Support user authentication and authorization.</li>
          <li>Maintain logs and audit trails for security and troubleshooting.</li>
          <li>Improve performance and reliability.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Data sharing</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Wolf Consulting Group, LLC does not sell BOAZ-OS customer data. Information may be shared with infrastructure and service providers,
          for example hosting, storage, monitoring, as needed to operate the service, subject to appropriate safeguards.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Data security</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Reasonable technical and organizational measures are used to help protect information in BOAZ-OS.
          However, no system can be completely secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Data retention</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Data is retained for as long as needed to provide the BOAZ-OS service and to comply with legal or contractual obligations.
          Customers may have additional data retention settings or policies within their own organizations.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. Customer responsibilities</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Customers are responsible for:
        </p>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
          <li>Configuring BOAZ-OS in a way that complies with their own policies.</li>
          <li>Providing appropriate notices and obtaining any required consents from end users.</li>
          <li>Handling data export and deletion requests applicable to their own data.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">8. Your rights</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          Depending on your jurisdiction and agreements, you may have rights related to access, correction, or deletion of information.
          These requests are typically handled between you and the customer organization that manages your account in BOAZ-OS.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">9. Changes to this Privacy Policy</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          This Privacy Policy may be updated from time to time. The updated version will be posted within BOAZ-OS or on the Wolf Consulting Group, LLC website.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">10. Contact</h2>
        <p className="max-w-3xl text-sm text-[color:var(--color-text)]">
          For questions about this Privacy Policy, contact{' '}
          <a href="mailto:support@wolfconsultingnc.com" className="text-[color:var(--color-primary-600)] hover:underline">
            support@wolfconsultingnc.com
          </a>
          .
        </p>
      </section>
    </div>
  )
}


