// Supabase connection. Paste the values from your Supabase dashboard:
// Project Settings → API → Project URL and the "anon public" key.
// The anon key is safe to publish; row level security (supabase/schema.sql)
// makes sure each signed-in student can only read and write their own data.
// Leave these empty to run the app without sign-in (data stays in the browser).
window.LSBF_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
