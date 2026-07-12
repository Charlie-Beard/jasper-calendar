// Writes public/version.json (git SHA + build time) for the page footer.
// Runs automatically before `wrangler dev` / `wrangler deploy` via the
// `build.command` in wrangler.jsonc. In Cloudflare Workers Builds the SHA
// comes from WORKERS_CI_COMMIT_SHA; locally it comes from git.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let sha = process.env.WORKERS_CI_COMMIT_SHA || '';
if (!sha) {
  try {
    sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { /* not a git checkout — fall through to 'dev' */ }
}

const version = { sha: sha.slice(0, 7) || 'dev', builtAt: new Date().toISOString() };
writeFileSync(new URL('../public/version.json', import.meta.url), JSON.stringify(version));
console.log(`version.json: ${version.sha} @ ${version.builtAt}`);
