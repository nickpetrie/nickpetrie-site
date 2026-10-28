// Deploys Studio: copies the brand files into web/, uploads web/ to R2 under studio-web/ (the worker
// serves the screens from there), then deploys the worker. Wrangler's own static-asset upload doesn't
// work through the Claude Code cloud proxy, which is why the screens live in R2.
// Usage: node studio/deploy.mjs   (in a cloud session the proxy adds the Cloudflare token)
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ACCOUNT = '97b38e997c8ed5ed5eb3264ef052e31f';
const BUCKET = 'nickpetrie-social';
const here = new URL('.', import.meta.url).pathname;
const web = join(here, 'web');
const token = process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_API_TOKEN !== 'proxy-injected' ? process.env.CLOUDFLARE_API_TOKEN : null;

execSync('node build.mjs', { cwd: here, stdio: 'inherit' });
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(web);
for (const f of files) {
  const key = 'studio-web/' + relative(web, f).split('\\').join('/');
  // curl, not fetch: Node's fetch skips the cloud session's proxy, which is what adds the token there.
  const auth = token ? ['-H', `authorization: Bearer ${token}`] : [];
  const out = execFileSync('curl', ['-sS', '-X', 'PUT', '--data-binary', `@${f}`, ...auth,
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${encodeURI(key)}`]).toString();
  if (!JSON.parse(out).success) throw new Error(`Upload failed for ${key}: ${out}`);
}
console.log(`Uploaded ${files.length} files to R2 ${BUCKET}/studio-web/.`);
execSync('npx wrangler deploy --config wrangler.jsonc', { cwd: here, stdio: 'inherit', env: { ...process.env, CLOUDFLARE_API_TOKEN: token || 'proxy-injected', CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
