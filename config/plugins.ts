import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET', 'dev-jwt-secret-change-me'),
      jwt: {
        expiresIn: '7d',
      },
    },
  },
  i18n: {
    enabled: true,
    config: {
      defaultLocale: 'en',
    },
  },
});

export default config;
