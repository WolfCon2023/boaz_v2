import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../db.js';
import { serialize as serializeSlaInternal, finalizeExecutedContract } from './slas.js';
export const contractsPublicRouter = Router();
function serializeContractForSigning(doc) {
    // Reuse internal serialize but drop sensitive history fields
    const full = serializeSlaInternal(doc);
    const { emailSends, signatureAudit, attachments, internalOwnerUserId, ...rest } = full;
    return rest;
}
// GET /api/public/contracts/sign/:token
contractsPublicRouter.get('/sign/:token', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { token } = req.params;
    const coll = db.collection('sla_signature_invites');
    const invite = await coll.findOne({ token });
    if (!invite)
        return res.status(404).json({ data: null, error: 'invalid_or_expired' });
    if (invite.status !== 'pending') {
        return res.status(410).json({ data: null, error: 'already_used' });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
        return res.status(410).json({ data: null, error: 'expired' });
    }
    const requiresOtp = !!invite.otpHash;
    // If OTP is required and not yet verified, only return minimal metadata
    if (requiresOtp && !invite.otpVerifiedAt) {
        return res.json({
            data: {
                requiresOtp: true,
                role: invite.role,
                signer: {
                    email: invite.email,
                    name: invite.name ?? '',
                    title: invite.title ?? '',
                },
            },
            error: null,
        });
    }
    const contract = await db
        .collection('sla_contracts')
        .findOne({ _id: invite.contractId });
    if (!contract)
        return res.status(404).json({ data: null, error: 'contract_not_found' });
    const safeContract = serializeContractForSigning(contract);
    res.json({
        data: {
            requiresOtp: requiresOtp && !invite.otpVerifiedAt ? true : false,
            contract: safeContract,
            role: invite.role,
            signer: {
                email: invite.email,
                name: invite.name ?? '',
                title: invite.title ?? '',
            },
        },
        error: null,
    });
});
const otpSchema = z.object({
    loginId: z.string().min(3).max(100),
    otpCode: z.string().min(4).max(64),
});
// POST /api/public/contracts/sign/:token/otp - verify one-time security code
contractsPublicRouter.post('/sign/:token/otp', async (req, res) => {
    const parsed = otpSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    try {
        const db = await getDb();
        if (!db)
            return res.status(500).json({ data: null, error: 'db_unavailable' });
        const { token } = req.params;
        const coll = db.collection('sla_signature_invites');
        const invite = await coll.findOne({ token });
        if (!invite)
            return res.status(404).json({ data: null, error: 'invalid_or_expired' });
        if (invite.status !== 'pending') {
            return res.status(410).json({ data: null, error: 'already_used' });
        }
        if (!invite.otpHash || !invite.otpExpiresAt) {
            return res.status(400).json({ data: null, error: 'otp_not_configured' });
        }
        const now = new Date();
        if (invite.otpExpiresAt < now) {
            return res.status(410).json({ data: null, error: 'otp_expired' });
        }
        const body = parsed.data;
        if (!invite.loginId || invite.loginId !== body.loginId) {
            return res.status(401).json({ data: null, error: 'login_invalid' });
        }
        const candidateHash = crypto.createHash('sha256').update(body.otpCode).digest('hex');
        if (candidateHash !== invite.otpHash) {
            return res.status(401).json({ data: null, error: 'otp_invalid' });
        }
        await coll.updateOne({ _id: invite._id }, {
            $set: {
                otpVerifiedAt: now,
            },
        });
        return res.json({ data: { ok: true }, error: null });
    }
    catch (err) {
        console.error('OTP verification error:', err);
        return res.status(500).json({ data: null, error: 'internal_error' });
    }
});
const signSchema = z.object({
    name: z.string().min(1),
    title: z.string().optional(),
    email: z.string().email(),
});
// POST /api/public/contracts/sign/:token
contractsPublicRouter.post('/sign/:token', async (req, res) => {
    const parsed = signSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { token } = req.params;
    const coll = db.collection('sla_signature_invites');
    const invite = await coll.findOne({ token });
    if (!invite)
        return res.status(404).json({ data: null, error: 'invalid_or_expired' });
    if (invite.status !== 'pending') {
        return res.status(410).json({ data: null, error: 'already_used' });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
        return res.status(410).json({ data: null, error: 'expired' });
    }
    const contractColl = db.collection('sla_contracts');
    const contract = await contractColl.findOne({ _id: invite.contractId });
    if (!contract)
        return res.status(404).json({ data: null, error: 'contract_not_found' });
    const now = new Date();
    const body = parsed.data;
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    const ua = req.headers['user-agent'];
    const update = {};
    if (invite.role === 'customerSigner') {
        update.signedByCustomer = body.name;
        update.signedAtCustomer = now;
    }
    else if (invite.role === 'providerSigner') {
        update.signedByProvider = body.name;
        update.signedAtProvider = now;
    }
    const auditEvent = {
        at: now,
        actor: body.name,
        event: `signed_${invite.role}`,
        ip,
        userAgent: ua,
        details: `Email: ${body.email}`,
    };
    await contractColl.updateOne({ _id: contract._id }, {
        $set: { ...update, updatedAt: now },
        $push: { signatureAudit: auditEvent },
    });
    await coll.updateOne({ _id: invite._id }, {
        $set: {
            status: 'signed',
            usedAt: now,
            name: body.name,
            title: body.title ?? invite.title,
        },
    });
    // Reload contract with latest signatures
    const refreshed = await contractColl.findOne({ _id: contract._id });
    if (!refreshed)
        return res.status(500).json({ data: null, error: 'update_failed' });
    // Treat the contract as executed once at least one signer has completed.
    // Only write the "fully_executed" event the first time we set executedDate.
    if (refreshed.signedAtCustomer || refreshed.signedAtProvider) {
        if (!refreshed.executedDate) {
            await contractColl.updateOne({ _id: refreshed._id }, {
                $set: {
                    status: 'active',
                    executedDate: now,
                    updatedAt: new Date(),
                },
                $push: {
                    signatureAudit: {
                        at: new Date(),
                        event: 'fully_executed',
                        details: 'Contract executed via public signing flow',
                    },
                },
            });
            // Refresh again so executedDate is present in the serialized view
            const again = await contractColl.findOne({ _id: contract._id });
            if (again) {
                // Generate and attach a final signed copy, and email to signers
                try {
                    await finalizeExecutedContract(again._id);
                }
                catch (err) {
                    console.error('Failed to finalize executed contract', err);
                }
            }
        }
        else {
            // Executed date already set: still (re)generate final copy to capture new signatures
            try {
                await finalizeExecutedContract(refreshed._id);
            }
            catch (err) {
                console.error('Failed to finalize executed contract', err);
            }
        }
    }
    const safeContract = serializeContractForSigning(refreshed);
    res.json({
        data: {
            contract: safeContract,
            role: invite.role,
        },
        error: null,
    });
});
// GET /api/public/contracts/attachments/:contractId/:attachmentId
// Serves stored contract attachments, including inline HTML "final" copies.
contractsPublicRouter.get('/attachments/:contractId/:attachmentId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { contractId, attachmentId } = req.params;
    if (!ObjectId.isValid(contractId) || !ObjectId.isValid(attachmentId)) {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const coll = db.collection('sla_contracts');
    const contract = await coll.findOne({ _id: new ObjectId(contractId) });
    if (!contract || !contract.attachments || !Array.isArray(contract.attachments)) {
        return res.status(404).json({ data: null, error: 'not_found' });
    }
    const attId = new ObjectId(attachmentId);
    const att = contract.attachments.find((a) => a && a._id && String(a._id) === String(attId));
    if (!att || !att.url) {
        return res.status(404).json({ data: null, error: 'attachment_not_found' });
    }
    const url = att.url;
    // If this is a data: URL (how final HTML copies are stored), decode and stream it
    if (url.startsWith('data:')) {
        try {
            const firstComma = url.indexOf(',');
            if (firstComma === -1)
                throw new Error('malformed_data_url');
            const meta = url.substring(5, firstComma); // strip "data:"
            const dataPart = url.substring(firstComma + 1);
            const isBase64 = meta.includes(';base64');
            const mimeType = meta.split(';')[0] || 'application/octet-stream';
            const buf = isBase64 ? Buffer.from(dataPart, 'base64') : Buffer.from(decodeURIComponent(dataPart), 'utf8');
            res.setHeader('Content-Type', mimeType || 'application/octet-stream');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return res.send(buf);
        }
        catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to decode data URL attachment (public)', err);
            return res.status(500).json({ data: null, error: 'attachment_decode_failed' });
        }
    }
    // For any non data: URLs, just redirect the browser
    return res.redirect(url);
});
