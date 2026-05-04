import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://egefeiuyktelihsbbzyt.supabase.co';
const supabaseKey = 'sb_publishable_hd_-u_hgdVcXXjkCbRPkDA_xHf9XOfe';

export const supabase = createClient(supabaseUrl, supabaseKey);
