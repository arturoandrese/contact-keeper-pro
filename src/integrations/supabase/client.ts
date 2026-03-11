import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://vomjhgjzzicuqnkyukps.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvbWpoZ2p6emljdXFua3l1a3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzMyNjAsImV4cCI6MjA4ODgwOTI2MH0.kmgKJACG7kjBhLkwLFoa5zxzH9AhSphqACT2jM0mC4c";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
