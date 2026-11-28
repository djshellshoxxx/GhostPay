import base from '../../apps/web/playwright.config';
import { resolve } from 'node:path';
import { replayLaunchOptions } from './replay-launch.mjs';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const web = resolve(root, 'apps/web');
const resultsDir = resolve(process.env.GHOSTPAY_RESULTS_DIR ?? 'stress-results');
const reporter = fileURLToPath(new URL('./reporter.mjs', import.meta.url));
const browserNames = ['chromium', 'firefox', 'webkit'] as const;
const baseUse = base.use ?? {};
const desktop = base.projects?.find((project) => project.name === 'desktop');

function engine(browserName: (typeof browserNames)[number]) {
  const executablePath = process.env[`GHOSTPAY_${browserName.toUpperCase()}`];
  return {
    ...desktop,
    name: browserName,
    use: {
      ...baseUse,
      ...(desktop?.use ?? {}),
      browserName,
      launchOptions: replayLaunchOptions(browserName, baseUse.launchOptions, executablePath),
    },
  };
}

const replayBuilt = process.env.GHOSTPAY_REPLAY_BUILT === '1';

export default {
  ...base,
  testDir: resolve(web, 'e2e'),
  outputDir: resolve(resultsDir, 'details'),
  reporter: [['list'], [reporter, { resultsDir }]],
  retries: 0,
  workers: Number(process.env.GHOSTPAY_STRESS_WORKERS ?? 2),
  projects: browserNames.map(engine),
  webServer: {
    ...base.webServer,
    cwd: web,
    ...(replayBuilt
      ? { command: 'npm run preview -- --configLoader runner --port 4173 --strictPort --host localhost' }
      : {}),
    env: {
      ...(base.webServer?.env ?? {}),
      GHOSTPAY_LOCAL_BUILD_PROFILE: 'lean',
      GHOSTPAY_PAGES_DEV: '1',
    },
  },
};
