module.exports = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  logging: false,
  synchronize: false,
  migrationsRun: false,
  entities: ['lib/model/**/*.js']
};
