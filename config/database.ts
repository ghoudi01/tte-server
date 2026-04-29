import path from 'path';
import fs from 'fs';
import type { Core } from '@strapi/strapi';

const config = (): Core.Config.Database => {
  const sqliteFilename = path.join(__dirname, '..', '..', '.tmp/data.db');
  fs.mkdirSync(path.dirname(sqliteFilename), { recursive: true });

  return {
    connection: {
      client: 'sqlite',
      connection: {
        filename: sqliteFilename,
      },
      useNullAsDefault: true,
      acquireConnectionTimeout: 60000,
    } as unknown as Core.Config.Database['connection'],
  };
};

export default config;
