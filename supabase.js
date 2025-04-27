import { config } from 'dotenv';
import knex from 'knex';

config();

const knexInstance = knex({
  client: 'pg',
  connection: {
    host: process.env.SUPABASE_HOST,
    port: process.env.SUPABASE_PORT || 6543,
    user: process.env.SUPABASE_USER,
    password: process.env.SUPABASE_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  }
});

export default knexInstance;
