import type { Core } from '@strapi/strapi';

const config = (): Core.Config.Admin => ({
  auth: {
    secret: 'tte-admin-jwt-secret',
  },
  apiToken: {
    salt: 'tte-api-token-salt',
  },
  transfer: {
    token: {
      salt: 'tte-transfer-token-salt',
    },
  },
  secrets: {
    encryptionKey: 'tte-encryption-key',
  },
  flags: {
    nps: true,
    promoteEE: true,
  },
});

export default config;
