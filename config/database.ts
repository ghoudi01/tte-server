import type { Core } from '@strapi/strapi';

const config = (): Core.Config.Database => {
  const neonConnectionString =
    'postgresql://neondb_owner:npg_RoadvjhxX25f@ep-wandering-sky-amnz26sh-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

  return {
    connection: {
      client: 'postgres',
      connection: {
        connectionString: neonConnectionString,
        schema: 'public',
      },
      pool: {
        min: 2,
        max: 10,
      },
      acquireConnectionTimeout: 60000,
    } as unknown as Core.Config.Database['connection'],
  };
};

export default config;
