import jwt from 'jsonwebtoken';
import { env } from '../env.js';
export function signToken(payload) {
    return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
}
export function verifyToken(token) {
    try {
        return jwt.verify(token, env.JWT_SECRET);
    }
    catch {
        return null;
    }
}
