/**
 * Admin API for Customer Portal User Management
 *
 * Allows admins to:
 * - View all customer portal users
 * - Create new customer users
 * - Verify emails manually
 * - Activate/deactivate accounts
 * - Track registration and login history
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from '../env.js';
import { generateEmailTemplate } from '../lib/email-templates.js';
import { sendAuthEmail } from '../auth/email.js';
export const adminCustomerPortalUsersRouter = Router();
// GET /api/admin/customer-portal-users - List all customer portal users
adminCustomerPortalUsersRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { status, search, limit = 100, offset = 0 } = req.query;
        // Build query
        const query = {};
        if (status === 'verified') {
            query.emailVerified = true;
        }
        else if (status === 'pending') {
            query.emailVerified = false;
        }
        else if (status === 'inactive') {
            query.active = false;
        }
        if (search && typeof search === 'string') {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
            ];
        }
        // Get users with pagination
        const users = await db.collection('customer_portal_users')
            .find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip(Number(offset))
            .toArray();
        // Get total count
        const total = await db.collection('customer_portal_users').countDocuments(query);
        // Get account names for users with accountId
        const accountIds = users
            .filter((u) => u.accountId)
            .map((u) => u.accountId);
        const accounts = accountIds.length > 0
            ? await db.collection('accounts')
                .find({ _id: { $in: accountIds } })
                .toArray()
            : [];
        const accountMap = new Map(accounts.map((a) => [a._id.toHexString(), a.name || a.companyName]));
        // Format users
        const formattedUsers = users.map((user) => ({
            id: user._id.toHexString(),
            email: user.email,
            name: user.name,
            company: user.company,
            phone: user.phone,
            accountId: user.accountId?.toHexString() || null,
            accountName: user.accountId ? accountMap.get(user.accountId.toHexString()) || 'Unknown' : null,
            emailVerified: user.emailVerified || false,
            active: user.active !== false,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt || null,
            verificationToken: user.verificationToken || null,
        }));
        res.json({
            data: {
                items: formattedUsers,
                total,
                limit: Number(limit),
                offset: Number(offset),
            },
            error: null
        });
    }
    catch (err) {
        console.error('Get customer portal users error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_users' });
    }
});
// POST /api/admin/customer-portal-users - Create new customer user
adminCustomerPortalUsersRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { email, name, password, company, phone, accountId, sendVerificationEmail = true } = req.body;
        if (!email || !name || !password) {
            return res.status(400).json({ data: null, error: 'missing_required_fields' });
        }
        // Check if email already exists
        const existingUser = await db.collection('customer_portal_users').findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ data: null, error: 'email_already_exists' });
        }
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        // Create user
        const newUser = {
            email: email.toLowerCase(),
            passwordHash,
            name,
            company: company || null,
            phone: phone || null,
            accountId: accountId ? new ObjectId(accountId) : null,
            emailVerified: !sendVerificationEmail, // Auto-verify if not sending email
            verificationToken: sendVerificationEmail ? verificationToken : null,
            resetToken: null,
            resetTokenExpiry: null,
            active: true,
            createdAt: new Date(),
            lastLoginAt: null,
        };
        const result = await db.collection('customer_portal_users').insertOne(newUser);
        // Send verification email if requested
        if (sendVerificationEmail) {
            const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
            const verifyUrl = `${baseUrl}/customer/verify-email?token=${verificationToken}`;
            const { html, text } = generateEmailTemplate({
                header: {
                    title: 'Welcome to Customer Portal',
                    subtitle: 'Verify Your Email',
                    icon: '🔐',
                },
                content: {
                    greeting: `Hello ${name},`,
                    message: 'Welcome to our Customer Portal! Your account has been created by an administrator.',
                    infoBox: {
                        title: 'Account Details',
                        items: [
                            { label: 'Email', value: email },
                            { label: 'Name', value: name },
                            ...(company ? [{ label: 'Company', value: company }] : []),
                        ],
                    },
                    actionButton: {
                        text: 'Verify Email & Set Password',
                        url: verifyUrl,
                    },
                    additionalInfo: 'Once verified, you can login to access your invoices, support tickets, and contracts. If you did not expect this email, please contact our support team.',
                },
            });
            await sendAuthEmail({
                to: email,
                subject: 'Welcome to Customer Portal - Verify Your Email',
                html,
                text,
                checkPreferences: false,
            });
        }
        res.json({
            data: {
                userId: result.insertedId.toHexString(),
                email,
                name,
                message: sendVerificationEmail
                    ? 'User created successfully. Verification email sent.'
                    : 'User created and auto-verified successfully.',
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Create customer portal user error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_create_user' });
    }
});
// PATCH /api/admin/customer-portal-users/:id/verify - Manually verify email
adminCustomerPortalUsersRouter.patch('/:id/verify', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const userId = req.params.id;
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        const result = await db.collection('customer_portal_users').updateOne({ _id: new ObjectId(userId) }, {
            $set: {
                emailVerified: true,
                verificationToken: null,
            }
        });
        if (result.matchedCount === 0) {
            return res.status(404).json({ data: null, error: 'user_not_found' });
        }
        res.json({ data: { message: 'Email verified successfully' }, error: null });
    }
    catch (err) {
        console.error('Verify customer email error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_verify_email' });
    }
});
// PATCH /api/admin/customer-portal-users/:id/activate - Activate/deactivate user
adminCustomerPortalUsersRouter.patch('/:id/activate', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const userId = req.params.id;
        const { active } = req.body;
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        if (typeof active !== 'boolean') {
            return res.status(400).json({ data: null, error: 'invalid_active_value' });
        }
        const result = await db.collection('customer_portal_users').updateOne({ _id: new ObjectId(userId) }, { $set: { active } });
        if (result.matchedCount === 0) {
            return res.status(404).json({ data: null, error: 'user_not_found' });
        }
        res.json({
            data: { message: active ? 'User activated' : 'User deactivated' },
            error: null
        });
    }
    catch (err) {
        console.error('Update customer user status error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_update_status' });
    }
});
// DELETE /api/admin/customer-portal-users/:id - Delete customer user
adminCustomerPortalUsersRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const userId = req.params.id;
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        const result = await db.collection('customer_portal_users').deleteOne({ _id: new ObjectId(userId) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ data: null, error: 'user_not_found' });
        }
        res.json({ data: { message: 'User deleted successfully' }, error: null });
    }
    catch (err) {
        console.error('Delete customer portal user error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_delete_user' });
    }
});
// PATCH /api/admin/customer-portal-users/:id - Update customer user
adminCustomerPortalUsersRouter.patch('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const userId = req.params.id;
        const { name, company, phone, accountId } = req.body;
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        const updates = {};
        if (name !== undefined)
            updates.name = name;
        if (company !== undefined)
            updates.company = company;
        if (phone !== undefined)
            updates.phone = phone;
        if (accountId !== undefined) {
            updates.accountId = accountId ? new ObjectId(accountId) : null;
        }
        const result = await db.collection('customer_portal_users').updateOne({ _id: new ObjectId(userId) }, { $set: updates });
        if (result.matchedCount === 0) {
            return res.status(404).json({ data: null, error: 'user_not_found' });
        }
        res.json({ data: { message: 'User updated successfully' }, error: null });
    }
    catch (err) {
        console.error('Update customer portal user error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_update_user' });
    }
});
// POST /api/admin/customer-portal-users/:id/resend-verification - Resend verification email
adminCustomerPortalUsersRouter.post('/:id/resend-verification', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const userId = req.params.id;
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        const user = await db.collection('customer_portal_users').findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).json({ data: null, error: 'user_not_found' });
        }
        if (user.emailVerified) {
            return res.status(400).json({ data: null, error: 'email_already_verified' });
        }
        // Generate new token if needed
        let verificationToken = user.verificationToken;
        if (!verificationToken) {
            verificationToken = crypto.randomBytes(32).toString('hex');
            await db.collection('customer_portal_users').updateOne({ _id: new ObjectId(userId) }, { $set: { verificationToken } });
        }
        // Send email
        const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
        const verifyUrl = `${baseUrl}/customer/verify-email?token=${verificationToken}`;
        const { html, text } = generateEmailTemplate({
            header: {
                title: 'Verify Your Email',
                subtitle: 'Customer Portal',
                icon: '✉️',
            },
            content: {
                greeting: `Hello ${user.name},`,
                message: 'Please verify your email address to activate your Customer Portal account.',
                actionButton: {
                    text: 'Verify Email Address',
                    url: verifyUrl,
                },
                additionalInfo: 'Once verified, you can login to access your invoices, support tickets, and contracts.',
            },
        });
        await sendAuthEmail({
            to: user.email,
            subject: 'Verify Your Email - Customer Portal',
            html,
            text,
            checkPreferences: false,
        });
        res.json({ data: { message: 'Verification email sent' }, error: null });
    }
    catch (err) {
        console.error('Resend verification email error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_resend_verification' });
    }
});
