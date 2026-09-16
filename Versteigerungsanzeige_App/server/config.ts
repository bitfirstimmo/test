import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.PORT ?? '3000');
const publicAppUrl = (process.env.PUBLIC_APP_URL ?? `http://localhost:${port}`).replace(/\/$/, '');

export const config = {
  port,
  publicAppUrl,
  licenseEmail: process.env.LICENSE_EMAIL ?? 'kontakt@example.de',
  licenseVersion: process.env.LICENSE_VERSION ?? 'DE-2026-01',
  databasePath: process.env.DATABASE_PATH ?? './data/auction.db',
  defaultSessionMinutes: Number(process.env.DEFAULT_SESSION_MINUTES ?? '30'),
  maxSessionMinutes: Number(process.env.MAX_SESSION_MINUTES ?? '240'),
  sessionLifetimeHours: Number(process.env.SESSION_LIFETIME_HOURS ?? '24'),
  sessionCleanupAfterEndHours: Number(process.env.SESSION_CLEANUP_AFTER_END_HOURS ?? '24')
};

export function ensureConfiguredPublicUrl(): string {
  return config.publicAppUrl;
}
