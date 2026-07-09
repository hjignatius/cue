import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// supabase is null when env vars are not set — all auth features silently no-op.
export const supabase = url && key ? createClient(url, key) : null;
