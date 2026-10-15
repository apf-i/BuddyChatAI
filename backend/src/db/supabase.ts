import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Create Supabase client with service role key for admin operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test connection with timeout
export async function testConnection() {
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection test timeout after 10 seconds')), 10000);
    });

    const testPromise = (async () => {
      // Try to query the users table - if it exists, connection is good
      // If it doesn't exist, that's OK (user needs to run migration), but connection is still valid
      const { data, error } = await supabase.from('users').select('id').limit(1);
      
      if (error) {
        // PGRST116 = table doesn't exist (user needs to run SQL migration)
        if (error.code === 'PGRST116' || error.code === 'PGRST205') {
          console.warn('⚠️  Supabase connected, but tables not found.');
          console.warn('   Please run the SQL migration: backend/src/db/migrations/001_create_tables.sql');
          console.warn('   Run it in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor');
          return true; // Connection is valid, just missing tables
        }
        // Other errors = connection problem
        console.error('❌ Supabase connection error:', error);
        return false;
      }
      
      console.log('✅ Supabase connected successfully');
      return true;
    })();

    // Race between test and timeout
    return await Promise.race([testPromise, timeoutPromise]) as boolean;
  } catch (err: any) {
    console.error('❌ Supabase connection failed:', err.message || err);
    return false;
  }
}
