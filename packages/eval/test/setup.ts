import dotenv from 'dotenv';
import path from 'node:path';

// Load environment variables for tests
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Set default FALKORDB_URL if not provided
if (!process.env.FALKORDB_URL) {
  process.env.FALKORDB_URL = 'falkor://localhost:6379';
}
