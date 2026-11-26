/** True only for a build made with VITE_MERCHANT_DASHBOARD=1 (see src/App.tsx and vite.config.ts). */
export const MERCHANT_DASHBOARD_BUILD = process.env['VITE_MERCHANT_DASHBOARD'] === '1';
export const MERCHANT_DASHBOARD_SKIP = 'the merchant dashboard is disabled in default builds (F04 excluded from beta/v1.0)';
