// Configuración de Bonita.
// Completá con los datos de TU proyecto de Supabase (Project Settings → API).
//
//  - supabaseUrl: la "Project URL", con la forma https://xxxxxxxx.supabase.co
//  - supabaseAnonKey: la clave PÚBLICA ("anon public" o "publishable").
//
// Es seguro que la clave pública esté en GitHub: la protección la dan las reglas
// del archivo supabase/schema.sql (cada usuaria solo puede ver y cambiar lo suyo).
//
// NUNCA pongas acá la clave "service_role" ni una "sb_secret_...": esa clave abre
// toda la base de datos. Si la pegás por error, la app se niega a conectarse.
//
// Si dejás los dos valores vacíos, Bonita funciona igual, guardando todo solo en el celular.
window.BONITA_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabaseAnonKey: ''
});
