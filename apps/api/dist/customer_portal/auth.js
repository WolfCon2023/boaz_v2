/**
 * External Customer Portal Authentication
 *
 * Provides registration and login for external customers to access
 * their invoices, tickets, and contracts through a self-service portal
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { sendAuthEmail } from '../auth/email.js';
import { generateEmailTemplate, formatEmailTimestamp } from '../lib/email-templates.js';
export const customerPortalAuthRouter = Router();
// JWT secret for customer tokens (separate from internal users)
const CUSTOMER_JWT_SECRET = env.JWT_SECRET || 'customer-portal-secret-change-in-production';
const CUSTOMER_JWT_EXPIRES_IN = '7d'; // 7 days
// Middleware to verify customer JWT token
export function verifyCustomerToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ data: null, error: 'unauthorized' });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
        req.customerAuth = {
            customerId: decoded.customerId,
            email: decoded.email,
            accountId: decoded.accountId,
        };
        next();
    }
    catch (err) {
        return res.status(401).json({ data: null, error: 'invalid_token' });
    }
}
// POST /api/customer-portal/auth/register - Customer registration
customerPortalAuthRouter.post('/register', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const schema = z.object({
            email: z.string().email(),
            password: z.string().min(8),
            name: z.string().min(2),
            company: z.string().optional(),
            phone: z.string().optional(),
        });
        const body = schema.parse(req.body);
        // Check if customer already exists
        const existing = await db.collection('customer_portal_users').findOne({ email: body.email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ data: null, error: 'email_already_registered' });
        }
        // Hash password
        const passwordHash = await bcrypt.hash(body.password, 10);
        // Generate verification token
        const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        // Try to link to existing account by email
        let accountId;
        const account = await db.collection('accounts').findOne({
            $or: [
                { primaryContactEmail: body.email.toLowerCase() },
                { email: body.email.toLowerCase() }
            ]
        });
        if (account) {
            accountId = account._id;
        }
        // Create customer portal user
        const newCustomer = {
            email: body.email.toLowerCase(),
            passwordHash,
            name: body.name,
            company: body.company,
            phone: body.phone,
            accountId,
            emailVerified: false,
            verificationToken,
            createdAt: new Date(),
            active: true,
        };
        const result = await db.collection('customer_portal_users').insertOne(newCustomer);
        const customerId = result.insertedId;
        // Send verification email
        const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
        const verifyUrl = `${baseUrl}/portal/verify-email?token=${verificationToken}`;
        const { html, text } = generateEmailTemplate({
            header: {
                title: 'Welcome to BOAZ-OS Customer Portal',
                subtitle: 'Verify your email to get started',
                icon: '👋',
            },
            content: {
                greeting: `Hello ${body.name},`,
                message: 'Thank you for registering for the BOAZ-OS Customer Portal. Please verify your email address to access your account and view invoices, tickets, and contracts.',
                infoBox: {
                    title: 'Account Details',
                    items: [
                        { label: 'Email', value: body.email },
                        { label: 'Name', value: body.name },
                        { label: 'Company', value: body.company || 'Not specified' },
                        { label: 'Registered', value: formatEmailTimestamp(new Date()) },
                    ],
                },
                actionButton: {
                    text: 'Verify Email Address',
                    url: verifyUrl,
                },
                additionalInfo: 'Once verified, you can login to view your invoices, support tickets, and contracts. If you did not create this account, please ignore this email.',
            },
        });
        await sendAuthEmail({
            to: body.email,
            subject: '👋 Welcome to BOAZ-OS Customer Portal - Verify Your Email',
            html,
            text,
        });
        res.json({
            data: {
                message: 'Registration successful. Please check your email to verify your account.',
                customerId: customerId.toHexString(),
                emailSent: true,
            },
            error: null
        });
    }
    catch (err) {
        console.error('Customer registration error:', err);
        if (err.name === 'ZodError') {
            return res.status(400).json({ data: null, error: 'invalid_input', details: err.errors });
        }
        res.status(500).json({ data: null, error: err.message || 'registration_failed' });
    }
});
// GET /api/customer-portal/auth/verify-email?token=xxx - Verify customer email
customerPortalAuthRouter.get('/verify-email', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const token = req.query.token;
        if (!token) {
            return res.status(400).json({ data: null, error: 'missing_token' });
        }
        const customer = await db.collection('customer_portal_users').findOne({ verificationToken: token });
        if (!customer) {
            return res.status(400).json({ data: null, error: 'invalid_token' });
        }
        // Mark email as verified
        await db.collection('customer_portal_users').updateOne({ _id: customer._id }, {
            $set: { emailVerified: true },
            $unset: { verificationToken: '' }
        });
        res.json({ data: { message: 'Email verified successfully. You can now login.' }, error: null });
    }
    catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ data: null, error: err.message || 'verification_failed' });
    }
});
// POST /api/customer-portal/auth/login - Customer login
customerPortalAuthRouter.post('/login', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const schema = z.object({
            email: z.string().email(),
            password: z.string(),
        });
        const body = schema.parse(req.body);
        // Find customer
        const customer = await db.collection('customer_portal_users').findOne({
            email: body.email.toLowerCase()
        });
        if (!customer) {
            return res.status(401).json({ data: null, error: 'invalid_credentials' });
        }
        // Check if account is active
        if (!customer.active) {
            return res.status(403).json({ data: null, error: 'account_inactive' });
        }
        // Verify password
        const passwordValid = await bcrypt.compare(body.password, customer.passwordHash);
        if (!passwordValid) {
            return res.status(401).json({ data: null, error: 'invalid_credentials' });
        }
        // Check if email is verified
        if (!customer.emailVerified) {
            return res.status(403).json({ data: null, error: 'email_not_verified' });
        }
        // Update last login
        await db.collection('customer_portal_users').updateOne({ _id: customer._id }, { $set: { lastLoginAt: new Date() } });
        // Generate JWT token
        const token = jwt.sign({
            customerId: customer._id.toHexString(),
            email: customer.email,
            accountId: customer.accountId?.toHexString() || null,
        }, CUSTOMER_JWT_SECRET, { expiresIn: CUSTOMER_JWT_EXPIRES_IN });
        res.json({
            data: {
                token,
                customer: {
                    id: customer._id.toHexString(),
                    email: customer.email,
                    name: customer.name,
                    company: customer.company,
                    accountId: customer.accountId?.toHexString(),
                },
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Customer login error:', err);
        if (err.name === 'ZodError') {
            return res.status(400).json({ data: null, error: 'invalid_input', details: err.errors });
        }
        res.status(500).json({ data: null, error: err.message || 'login_failed' });
    }
});
// GET /api/customer-portal/auth/me - Get current customer info
customerPortalAuthRouter.get('/me', verifyCustomerToken, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const customer = await db.collection('customer_portal_users').findOne({
            _id: new ObjectId(req.customerAuth.customerId)
        });
        if (!customer) {
            return res.status(404).json({ data: null, error: 'customer_not_found' });
        }
        res.json({
            data: {
                id: customer._id.toHexString(),
                email: customer.email,
                name: customer.name,
                company: customer.company,
                phone: customer.phone,
                accountId: customer.accountId?.toHexString(),
                emailVerified: customer.emailVerified,
                createdAt: customer.createdAt,
                lastLoginAt: customer.lastLoginAt,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Get customer info error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_customer' });
    }
});
// POST /api/customer-portal/auth/forgot-password - Request password reset
customerPortalAuthRouter.post('/forgot-password', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const schema = z.object({
            email: z.string().email(),
        });
        const body = schema.parse(req.body);
        const customer = await db.collection('customer_portal_users').findOne({
            email: body.email.toLowerCase()
        });
        // Always return success (don't reveal if email exists)
        if (!customer) {
            return res.json({ data: { message: 'If that email exists, a reset link has been sent.' }, error: null });
        }
        // Generate reset token
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
        await db.collection('customer_portal_users').updateOne({ _id: customer._id }, { $set: { resetToken, resetTokenExpiry } });
        // Send reset email
        const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
        const resetUrl = `${baseUrl}/portal/reset-password?token=${resetToken}`;
        const { html, text } = generateEmailTemplate({
            header: {
                title: 'Reset Your Password',
                subtitle: 'Customer Portal Password Reset',
                icon: '🔐',
            },
            content: {
                greeting: `Hello ${customer.name},`,
                message: 'We received a request to reset your password for the BOAZ-OS Customer Portal. Click the button below to create a new password.',
                infoBox: {
                    title: 'Reset Request Details',
                    items: [
                        { label: 'Email', value: customer.email },
                        { label: 'Requested', value: formatEmailTimestamp(new Date()) },
                        { label: 'Expires', value: '1 hour' },
                    ],
                },
                actionButton: {
                    text: 'Reset Password',
                    url: resetUrl,
                },
                additionalInfo: 'This link will expire in 1 hour. If you did not request a password reset, please ignore this email and your password will remain unchanged.',
            },
        });
        await sendAuthEmail({
            to: customer.email,
            subject: '🔐 Reset Your BOAZ-OS Customer Portal Password',
            html,
            text,
        });
        res.json({ data: { message: 'If that email exists, a reset link has been sent.' }, error: null });
    }
    catch (err) {
        console.error('Forgot password error:', err);
        if (err.name === 'ZodError') {
            return res.status(400).json({ data: null, error: 'invalid_input', details: err.errors });
        }
        res.status(500).json({ data: null, error: err.message || 'forgot_password_failed' });
    }
});
// POST /api/customer-portal/auth/reset-password - Reset password with token
customerPortalAuthRouter.post('/reset-password', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const schema = z.object({
            token: z.string(),
            newPassword: z.string().min(8),
        });
        const body = schema.parse(req.body);
        const customer = await db.collection('customer_portal_users').findOne({
            resetToken: body.token,
            resetTokenExpiry: { $gt: new Date() }
        });
        if (!customer) {
            return res.status(400).json({ data: null, error: 'invalid_or_expired_token' });
        }
        // Hash new password
        const passwordHash = await bcrypt.hash(body.newPassword, 10);
        // Update password and clear reset token
        await db.collection('customer_portal_users').updateOne({ _id: customer._id }, {
            $set: { passwordHash },
            $unset: { resetToken: '', resetTokenExpiry: '' }
        });
        res.json({ data: { message: 'Password reset successfully. You can now login.' }, error: null });
    }
    catch (err) {
        console.error('Reset password error:', err);
        if (err.name === 'ZodError') {
            return res.status(400).json({ data: null, error: 'invalid_input', details: err.errors });
        }
        res.status(500).json({ data: null, error: err.message || 'reset_password_failed' });
    }
});
