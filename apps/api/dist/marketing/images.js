import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { env } from '../env.js';
import { requireAuth } from '../auth/rbac.js';
export const marketingImagesRouter = Router();
// Setup multer for image uploads
const uploadDir = env.UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'marketing');
if (!fs.existsSync(uploadDir))
    fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const ts = Date.now();
        const ext = path.extname(safe);
        const name = path.basename(safe, ext);
        cb(null, `${ts}-${name}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for images
    fileFilter: (_req, file, cb) => {
        // Only allow image files
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, SVG)'));
        }
    },
});
// POST /api/marketing/images/upload - Upload an image for campaigns
marketingImagesRouter.post('/images/upload', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ data: null, error: 'no_file' });
        }
        // Return the URL to access the image
        // The image will be served via static file serving at /api/marketing/images/:filename
        const filename = file.filename;
        const url = `/api/marketing/images/${filename}`;
        res.json({
            data: {
                url,
                filename,
                originalName: file.originalname,
                size: file.size,
                mimetype: file.mimetype,
            },
            error: null
        });
    }
    catch (err) {
        console.error('Image upload error:', err);
        res.status(500).json({ data: null, error: err.message || 'upload_failed' });
    }
});
// GET /api/marketing/images/:filename - Serve uploaded images
marketingImagesRouter.get('/images/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        // Security: prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ data: null, error: 'invalid_filename' });
        }
        const filePath = path.resolve(uploadDir, filename);
        // Additional security: ensure the resolved path is still within uploadDir
        const resolvedUploadDir = path.resolve(uploadDir);
        if (!filePath.startsWith(resolvedUploadDir)) {
            return res.status(400).json({ data: null, error: 'invalid_filename' });
        }
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ data: null, error: 'file_not_found' });
        }
        // Determine content type
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        res.sendFile(filePath);
    }
    catch (err) {
        console.error('Image serve error:', err);
        res.status(500).json({ data: null, error: 'serve_failed' });
    }
});
