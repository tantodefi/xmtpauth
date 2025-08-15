const url = require('url');

// Parse DATABASE_URL
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const parsedUrl = new url.URL(dbUrl);

module.exports = {
  type: 'postgres',
  host: parsedUrl.hostname,
  port: parsedUrl.port || 5432,
  username: parsedUrl.username,
  password: parsedUrl.password,
  database: parsedUrl.pathname.substring(1),
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: ['lib/model/**/*.js'],
  migrations: ['lib/migration/**/*.js'],
  subscribers: ['lib/subscriber/**/*.js'],
  cli: {
    entitiesDir: 'src/model',
    migrationsDir: 'src/migration',
    subscribersDir: 'src/subscriber'
  }
};
