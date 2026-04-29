import type { Core } from '@strapi/strapi';

const config = (): Core.Config.Database => {
  const neonConnectionString =
    'postgresql://user:password@ep-cool-forest-123456.us-east-2.aws.neon.tech/ttte?sslmode=require';

  return {
    connection: {
      client: 'postgres',
      connection: {
        connectionString: neonConnectionString,
        ssl: {
          rejectUnauthorized: false,
        },
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
