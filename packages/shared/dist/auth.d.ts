export type User = {
    id: string;
    email: string;
    name?: string;
    createdAt: number;
};
export type RegisterInput = {
    email: string;
    password: string;
    name?: string;
};
export type Credentials = {
    email: string;
    password: string;
};
export type AuthTokenPayload = {
    sub: string;
    email: string;
};
export type AuthResponse = {
    token: string;
    user: User;
};
