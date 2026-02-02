import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const SUPABASE_URL = "https://qxocjsthqflgffgqbrhe.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4b2Nqc3RocWZsZ2ZmZ3FicmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTYyMzIsImV4cCI6MjA3ODYzMjIzMn0.DH1LQ1N7tBHMyKlBpuzLU69GBeMhoq-z92CnX0i-7jY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

