import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { getDb } from '../db.js'
import { serialize as serializeSlaInternal, SlaContractDoc } from './slas.js'

export const contractsPublicRouter = Router()

type SignatureInviteStatus = 'pending' | 'signed' | 'expired' | 'cancelled'

type SignatureInviteDoc = {
  _id: ObjectId
  contractId: ObjectId
  role: 'customerSigner' | 'providerSigner'
  email: string
  name?: string
  title?: string
  token: string
  status: SignatureInviteStatus
  expiresAt: Date | null
  usedAt: Date | null
  createdAt: Date
  createdByUserId?: ObjectId
}

function serializeContractForSigning(doc: SlaContractDoc) {
  // Reuse internal serialize but drop sensitive history fields
  const full = serializeSlaInternal(doc)
  const {
    emailSends,
    signatureAudit,
    attachments,
    internalOwnerUserId,
    ...rest
  } = full as any
  return rest
}

// GET /api/public/contracts/sign/:token
contractsPublicRouter.get('/sign/:token', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { token } = req.params
  const coll = db.collection<SignatureInviteDoc>('sla_signature_invites')

  const invite = await coll.findOne({ token })
  if (!invite) return res.status(404).json({ data: null, error: 'invalid_or_expired' })

  if (invite.status !== 'pending') {
    return res.status(410).json({ data: null, error: 'already_used' })
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return res.status(410).json({ data: null, error: 'expired' })
  }

  const contract = await db
    .collection<SlaContractDoc>('sla_contracts')
    .findOne({ _id: invite.contractId })

  if (!contract) return res.status(404).json({ data: null, error: 'contract_not_found' })

  const safeContract = serializeContractForSigning(contract)

  res.json({
    data: {
      contract: safeContract,
      role: invite.role,
      signer: {
        email: invite.email,
        name: invite.name ?? '',
        title: invite.title ?? '',
      },
    },
    error: null,
  })
})

const signSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email(),
})

// POST /api/public/contracts/sign/:token
contractsPublicRouter.post('/sign/:token', async (req, res) => {
  const parsed = signSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { token } = req.params
  const coll = db.collection<SignatureInviteDoc>('sla_signature_invites')

  const invite = await coll.findOne({ token })
  if (!invite) return res.status(404).json({ data: null, error: 'invalid_or_expired' })

  if (invite.status !== 'pending') {
    return res.status(410).json({ data: null, error: 'already_used' })
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return res.status(410).json({ data: null, error: 'expired' })
  }

  const contractColl = db.collection<SlaContractDoc>('sla_contracts')
  const contract = await contractColl.findOne({ _id: invite.contractId })
  if (!contract) return res.status(404).json({ data: null, error: 'contract_not_found' })

  const now = new Date()
  const body = parsed.data

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip
  const ua = req.headers['user-agent'] as string | undefined

  const update: Partial<SlaContractDoc> = {}

  if (invite.role === 'customerSigner') {
    update.signedByCustomer = body.name
    update.signedAtCustomer = now
  } else if (invite.role === 'providerSigner') {
    update.signedByProvider = body.name
    update.signedAtProvider = now
  }

  const auditEvent = {
    at: now,
    actor: body.name,
    event: `signed_${invite.role}`,
    ip,
    userAgent: ua,
    details: `Email: ${body.email}`,
  }

  await contractColl.updateOne(
    { _id: contract._id },
    {
      $set: { ...update, updatedAt: now },
      $push: { signatureAudit: auditEvent },
    },
  )

  await coll.updateOne(
    { _id: invite._id },
    {
      $set: {
        status: 'signed',
        usedAt: now,
        name: body.name,
        title: body.title ?? invite.title,
      },
    },
  )

  // Check if both sides have signed
  const refreshed = await contractColl.findOne({ _id: contract._id })
  if (!refreshed) return res.status(500).json({ data: null, error: 'update_failed' })

  if (refreshed.signedAtCustomer && refreshed.signedAtProvider && refreshed.status !== 'active') {
    await contractColl.updateOne(
      { _id: refreshed._id },
      {
        $set: {
          status: 'active',
          executedDate: refreshed.executedDate ?? now,
          updatedAt: new Date(),
        },
        $push: {
          signatureAudit: {
            at: new Date(),
            event: 'fully_executed',
            details: 'Both parties have signed',
          },
        },
      },
    )
  }

  const safeContract = serializeContractForSigning(refreshed)

  res.json({
    data: {
      contract: safeContract,
      role: invite.role,
    },
    error: null,
  })
})


