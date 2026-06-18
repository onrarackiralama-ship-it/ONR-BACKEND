// src/config/database.js - PostgreSQL Connection Configuration
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Managed Postgres (Neon/Render/RDS) requires SSL. Enable it when the target
// looks managed or in production, but stay off for a plain local Postgres so
// local dev doesn't break. Works whether connecting via DATABASE_URL
// (?sslmode=require) or the individual DATABASE_* params.
const connTarget = `${process.env.DATABASE_URL || ''}${process.env.DATABASE_HOST || ''}`;
const needsSSL =
  process.env.DATABASE_SSL === 'true' ||
  process.env.NODE_ENV === 'production' ||
  /sslmode=require|neon\.tech|\.render\.com|amazonaws/.test(connTarget);

// Database connection options
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  dialect: 'postgres',
  dialectOptions: needsSSL ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Database connection test
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL connection established successfully');
    console.log(`📦 Database: ${process.env.DATABASE_NAME}`);
    console.log(`🏠 Host: ${process.env.DATABASE_HOST || '(from DATABASE_URL)'}`);

    // One-time schema bootstrap for a fresh/empty database. Guarded by DB_SYNC so
    // it NEVER runs in normal operation. Set DB_SYNC=true on the first boot
    // against an empty DB to create missing tables, then remove the flag.
    // create-only sync() (no alter/force) — never touches existing data.
    if (process.env.DB_SYNC === 'true') {
      await sequelize.sync();
      console.log('🔄 Schema bootstrapped (created missing tables)');
      // Seed a default super-admin so you can log in on a brand-new DB.
      // ⚠️ CHANGE this password immediately after the first login.
      try {
        const Admin = require('../models/Admin');
        await Admin.createDefaultAdmin();
      } catch (e) {
        console.warn('⚠️ default admin seed skipped:', e.message);
      }
    }

  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error);
    throw error;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await sequelize.close();
    console.log('👋 PostgreSQL connection closed due to app termination');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
    process.exit(1);
  }
});

module.exports = { sequelize, connectDB };