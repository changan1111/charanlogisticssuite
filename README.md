# Charan Logistics Suite — Final

Invoicing + Fleet Management in one React/Vite app. One Supabase project, one login, one GitHub Pages deploy.

## Layout
- Company banner (`public/header.png`) on every page
- White collapsible sidebar: **Invoicing first** (Invoices, Insights, Add Invoice, Excel Import, Payroll, Quotation, WhatsApp — one flat block), then **Fleet** (Add Entry, Day Entry, History, Dashboard, Charts, Compare Months, Insights, Cash on Hand, Cash Meter, Vehicles, Report, Settle Driver, Trips)
- Dark section bar: InvoiceManager (with reminders bell, Settings, Refresh) on invoicing pages; FleetManagement on fleet pages
- Mobile (≤860px): sidebar becomes a drawer via the ☰ button; desktop shows it always
- URL routing (HashRouter): every page is deep-linkable, refresh keeps your place; default route is /invoicing/invoices

## Styling
`src/fleet/styles/app.css` is fully scoped under `#fleet-root` and re-themed to the invoice palette (navy/steel, Outfit font, light surfaces). `src/invoice/styles/global.css` is the base theme with `#invoice-root`-scoped tables. `src/styles/shell.css` (banner + sidebar layout) loads last.

## Auth
No session → redirect to `public/login.html` (branded page; credentials injected at deploy). If credentials are missing, login.html shows a clear setup message instead of crashing.

## Deploy — the only things you need to do
1. Push to `main` on GitHub.
2. Repo → Settings → Secrets: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Repo → Settings → Variables: add `VITE_BASE_PATH` = `/<your-repo-name>/`.
4. Repo → Settings → Pages: Source = GitHub Actions.

Optional (recommended): add `APP_URL`, `APP_EMAIL`, `APP_PASSWORD` secrets so the daily `keep-alive.yml` workflow keeps the free-tier Supabase project from pausing. Disable the keep-alive schedules in the two old repos once this is live.

## Local dev
```bash
npm install
cp .env.example .env      # fill in Supabase URL + anon key
node inject-login-env.js  # injects them into public/login.html (do NOT commit it after)
npm run dev
```
