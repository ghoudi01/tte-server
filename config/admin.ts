import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'default-admin-jwt-secret-change-in-production'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'default-api-token-salt-change-in-production'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'default-transfer-token-salt'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY', 'default-encryption-key-change-in-production'),
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});

export default config;
