import { Link } from 'react-router-dom'

export default function AboutBoazOs() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">About BOAZ-OS Version 2</h1>
        <Link
          to="/"
          className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
        >
          Back to Home
        </Link>
      </div>

      <section className="space-y-3">
        <p className="text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          Back Office Applications ZoneOS (BOAZ-OS) is an integrated back office management suite designed by Wolf Consulting Group, LLC.
          BOAZ-OS gives small and mid sized organizations a modern workspace for operations, scheduling, customer management, appointments,
          analytics, and administrative workflows.
        </p>
        <p className="text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          Version 2 of BOAZ-OS is built to simplify business operations with a flexible, scalable, and secure architecture.
          It brings together multiple back office modules into a unified platform designed for efficiency, clarity, and productivity.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What BOAZ-OS helps you manage</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          BOAZ-OS provides a collection of connected modules that support core back office tasks.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
          <li>Appointments and scheduling</li>
          <li>CRM and customer tracking</li>
          <li>Tasks and work management</li>
          <li>Calendar and team planning</li>
          <li>Reporting and analytics</li>
          <li>User and role management</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ownership and copyright</h2>
        <p className="text-sm leading-relaxed text-[color:var(--color-text)]">
          BOAZ-OS is created and owned by Wolf Consulting Group, LLC.
        </p>
        <p className="text-sm leading-relaxed text-[color:var(--color-text)]">
          Copyright © 2025 Wolf Consulting Group, LLC. All Rights Reserved.
        </p>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 text-sm">
          <div>Registered Work: Back Office Applications ZoneOS (BOAZ)</div>
          <div>Version: 2.0</div>
          <div>Copyright Registration Number: TXu002502244</div>
          <div>Registration Date: April 15, 2025</div>
          <div>Claimant and Owner: Wolf Consulting Group, LLC</div>
          <div className="mt-2">
            Website:{' '}
            <a
              href="https://www.wolfconsultingnc.com"
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--color-primary-600)] hover:underline"
            >
              https://www.wolfconsultingnc.com
            </a>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          This software and all related materials are protected by United States copyright law.
          No part of this application may be reproduced, distributed, modified, or transmitted in any form
          without prior written permission from Wolf Consulting Group, LLC.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Trademarks</h2>
        <p className="text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          BOAZ-OS, Back Office Applications ZoneOS, and the Wolf Consulting Group logo are trademarks or service marks
          of Wolf Consulting Group, LLC.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Technology</h2>
        <p className="text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          BOAZ-OS Version 2 is built with a modern web stack that supports secure, scalable, and maintainable operations.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
          <li>React for the frontend user interface</li>
          <li>Node.js and Express for backend APIs</li>
          <li>MongoDB for data storage</li>
          <li>Railway and Cloudflare for hosting, routing, and infrastructure services</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Contact and support</h2>
        <p className="text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          For technical support, onboarding assistance, or general questions about BOAZ-OS, please contact:
        </p>
        <div className="max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 text-sm">
          <div className="font-semibold">Wolf Consulting Group, LLC</div>
          <div>
            Email:{' '}
            <a
              href="mailto:support@wolfconsultingnc.com"
              className="text-[color:var(--color-primary-600)] hover:underline"
            >
              support@wolfconsultingnc.com
            </a>
          </div>
          <div>
            Website:{' '}
            <a
              href="https://www.wolfconsultingnc.com"
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--color-primary-600)] hover:underline"
            >
              https://www.wolfconsultingnc.com
            </a>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-[color:var(--color-border)] pt-6">
        <h2 className="text-lg font-semibold">Legal</h2>
        <p className="text-sm leading-relaxed text-[color:var(--color-text-muted)]">
          The following documents describe important legal terms for using BOAZ-OS Version 2.
          They are provided as templates and should be reviewed by legal counsel before being treated as final legal documents.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href="/legal/eula" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 hover:bg-[color:var(--color-muted)]">
            End User License Agreement (EULA)
          </a>
          <a href="/legal/terms" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 hover:bg-[color:var(--color-muted)]">
            Terms of Service
          </a>
          <a href="/legal/privacy" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 hover:bg-[color:var(--color-muted)]">
            Privacy Policy
          </a>
        </div>
      </section>
    </div>
  )
}


