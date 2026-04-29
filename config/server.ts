import type { Core } from '@strapi/strapi';

const config = (): Core.Config.Server => ({
  host: '0.0.0.0',
  port: 1337,
  url: '',
  app: {
    keys: ['tte-app-key-1', 'tte-app-key-2'],
  },
});

export default config;
