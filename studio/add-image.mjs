// Upload a rendered card to Studio's media bucket and print its public URL (Buffer fetches it from there).
//   node studio/add-image.mjs rendered.png <name> <version>   ->  https://studio.nickpetrie.co/p/<name>-v<version>.jpg
// For carousel slides use <post-id>-s<N> as the name. PNGs become JPEG (quality 90). Names are never reused:
// it refuses one that exists. In a Claude Code cloud session the proxy adds the Cloudflare token.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ACCOUNT = '97b38e997c8ed5ed5eb3264ef052e31f';
const BUCKET = 'nickpetrie-social';
const BASE = 'https://studio.nickpetrie.co/p/';

const [file, name, version] = process.argv.slice(2);
if (!file || !name || !/^\d+[a-z]?$/.test(version || '') || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: node studio/add-image.mjs rendered.png <name> <version>   (name: lowercase, digits, hyphens)');
  process.exit(1);
}
const key = `${name}-v${version}.jpg`;
const api = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`;
const token = process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_API_TOKEN !== 'proxy-injected' ? ['-H', `authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}`] : [];

// curl, not fetch: Node's fetch skips the cloud session's proxy, which is what adds the token.
const head = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', ...token, api]).toString();
if (head === '200') { console.error(`${key} already exists. Use the next version or a suffix such as ${version}b.`); process.exit(1); }

const sharp = require('sharp');
const tmp = path.join(os.tmpdir(), key);
await sharp(file).flatten({ background: '#F7F6F1' }).jpeg({ quality: 90, mozjpeg: true }).toFile(tmp);
const out = execFileSync('curl', ['-sS', '-X', 'PUT', '-H', 'content-type: image/jpeg', '--data-binary', `@${tmp}`, ...token, api]).toString();
fs.rmSync(tmp);
if (!JSON.parse(out).success) { console.error(`Upload failed: ${out}`); process.exit(1); }
console.log(BASE + key);
