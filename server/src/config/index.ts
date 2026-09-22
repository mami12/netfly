export const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET must be set in production'); })() : 'dev-only-insecure-secret-change-me');
export const JWT_EXPIRES_IN = '24h';
export const PORT = parseInt(process.env.PORT || '3001', 10);
export const CORS_ORIGINS = process.env.CORS_ORIGINS || '*';