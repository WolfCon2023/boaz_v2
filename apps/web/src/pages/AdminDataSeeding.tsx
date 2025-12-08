/**
 * Admin: Data Seeding Tools
 * 
 * Trigger data seeding operations
 */

import { useState } from 'react'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'
import { Database, Play, CheckCircle, Loader } from 'lucide-react'

export default function AdminDataSeeding() {
  const { showToast } = useToast()
  
  const [seedingRoles, setSeedingRoles] = useState(false)
  const [seedingKB, setSeedingKB] = useState(false)
  const [rolesResult, setRolesResult] = useState<any>(null)
  const [kbResult, setKBResult] = useState<any>(null)

  async function seedITRoles() {
    setSeedingRoles(true)
    setRolesResult(null)
    try {
      const res = await http.post('/api/admin/seed/it-roles')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setRolesResult(res.data.data)
        showToast('IT roles seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed roles', 'error')
    } finally {
      setSeedingRoles(false)
    }
  }

  async function seedRolesKB() {
    setSeedingKB(true)
    setKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/roles-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setKBResult(res.data.data)
        showToast('KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed KB', 'error')
    } finally {
      setSeedingKB(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Data Seeding Tools</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
          Trigger data seeding operations for roles and knowledge base articles
        </p>
      </div>

      {/* Seed IT Roles */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">IT Roles</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Add IT and IT Manager roles to the system. Safe to run multiple times.
            </p>
            <button
              onClick={seedITRoles}
              disabled={seedingRoles}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingRoles ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed IT Roles</span>
                </>
              )}
            </button>
          </div>
        </div>

        {rolesResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{rolesResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>IT Role: {rolesResult.results.it}</p>
                  <p>IT Manager Role: {rolesResult.results.it_manager}</p>
                  <p className="mt-2">Total Roles in System: {rolesResult.totalRoles}</p>
                  {rolesResult.roles && (
                    <div className="mt-2">
                      <p className="font-medium">All Roles:</p>
                      <ul className="ml-4 mt-1">
                        {rolesResult.roles.map((r: any) => (
                          <li key={r.name}>
                            {r.name} ({r.permissions} permissions)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Roles & Permissions KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article explaining all system roles. Updates if already exists.
            </p>
            <button
              onClick={seedRolesKB}
              disabled={seedingKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed KB Article</span>
                </>
              )}
            </button>
          </div>
        </div>

        {kbResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{kbResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {kbResult.title}</p>
                  <p>Slug: {kbResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={kbResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {kbResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>ℹ️ Note:</strong> These seeding operations run on the server where MongoDB is accessible. They are safe to run multiple times and will skip existing data.
        </p>
      </div>
    </div>
  )
}

