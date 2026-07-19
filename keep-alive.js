// ═══════════════════════════════════════════════
//  SUPABASE KEEP-ALIVE (final suite)
//  Logs in via login.html, then visits invoice + fleet
//  screens so real DB queries fire daily.
//  Secrets: APP_URL, APP_EMAIL, APP_PASSWORD
// ═══════════════════════════════════════════════
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    console.log('1. Going to login page...');
    await page.goto(process.env.APP_URL, { waitUntil: 'networkidle' });
    console.log('Current page URL:', page.url());
    await page.screenshot({ path: 'screenshots/01-login-page.png' });

    await page.fill('#emailInput', process.env.APP_EMAIL);
    await page.fill('#pwInput', process.env.APP_PASSWORD);
    await page.click('#loginBtn');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'screenshots/02-after-login.png' });
    console.log('✓ Logged in — invoices load automatically (clients + line_items queries)');

    // Sidebar entries are NavLink anchors; sections are expanded by default.
    const fleetLinks = ['Dashboard', 'History', 'Vehicles', 'Charts'];
    for (let i = 0; i < fleetLinks.length; i++) {
      await page.getByRole('link', { name: new RegExp(fleetLinks[i]) }).first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `screenshots/0${3 + i}-fleet-${fleetLinks[i].toLowerCase()}.png` });
      console.log(`✓ Fleet ${fleetLinks[i]} loaded`);
    }

    console.log('✅ All done — Supabase is alive!');
  } catch (err) {
    console.error('❌ Keep-alive failed:', err.message);
    await page.screenshot({ path: 'screenshots/error.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
