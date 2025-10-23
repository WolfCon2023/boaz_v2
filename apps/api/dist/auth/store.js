import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
const users = new Map();
export async function createUser(email, password, name) {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const user = { id, email, name, createdAt: now, passwordHash };
    users.set(email.toLowerCase(), user);
    return { id, email, name, createdAt: now };
}
export async function verifyCredentials(email, password) {
    const user = users.get(email.toLowerCase());
    if (!user)
        return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
        return null;
    const { passwordHash, ...safe } = user;
    return safe;
}
export function getUserByEmail(email) {
    const user = users.get(email.toLowerCase());
    if (!user)
        return null;
    const { passwordHash, ...safe } = user;
    return safe;
}
