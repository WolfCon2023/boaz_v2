import * as React from 'react'
import { Link } from 'react-router-dom'

type AboutBoazModalProps = {
  isOpen: boolean
  onClose: () => void
}

export function AboutBoazModal({ isOpen, onClose }: AboutBoazModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60">
      <div className="w-[min(90vw,32rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold">About BOAZ-OS Version 2</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
          >
            Close
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <p className="text-[color:var(--color-text-muted)]">
            BOAZ-OS (Back Office Applications ZoneOS) is a back office management suite created by Wolf Consulting Group, LLC.
            It unifies scheduling, CRM, tasks, and analytics in one modern workspace so teams can manage operations more clearly and efficiently.
          </p>
          <div className="space-y-1">
            <div className="font-semibold">Ownership</div>
            <div>Version: 2.0</div>
            <div>Owner: Wolf Consulting Group, LLC</div>
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
            <div>
              Support:{' '}
              <a
                href="mailto:support@wolfconsultingnc.com"
                className="text-[color:var(--color-primary-600)] hover:underline"
              >
                support@wolfconsultingnc.com
              </a>
            </div>
          </div>
          <div className="space-y-1 text-xs text-[color:var(--color-text-muted)]">
            <div>
              Copyright © 2025 Wolf Consulting Group, LLC. All Rights Reserved.
            </div>
            <div>
              Registered work: Back Office Applications ZoneOS (BOAZ), Registration Number: TXu002502244.
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <Link
              to="/about"
              onClick={onClose}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
            >
              View full About page
            </Link>
            <div className="text-[color:var(--color-text-muted)]">
              BOAZ-OS Version 2, Back Office Applications ZoneOS.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


