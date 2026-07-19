// Run this locally to inject your .env values into public/login.html for local testing.
// Usage: node inject-login-env.js
import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('❌ VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing in .env')
  process.exit(1)
}

const path = 'public/login.html'
let content = fs.readFileSync(path, 'utf8')
content = content.replace('%%SUPABASE_URL%%', url)
content = content.replace('%%SUPABASE_ANON_KEY%%', key)
fs.writeFileSync(path, content)
console.log('✅ Injected Supabase credentials into', path)
