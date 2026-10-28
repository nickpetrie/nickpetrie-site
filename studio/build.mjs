// Copies the brand templates, fonts, logo and photos into web/ so Studio draws posts exactly as
// Claude renders them. Run before every deploy; never edit the copies.
import { cpSync, rmSync } from 'node:fs';
const brand = new URL('../.claude/skills/nick-petrie-brand/', import.meta.url);
const web = new URL('./web/', import.meta.url);
for (const dir of ['templates', 'assets']) {
  rmSync(new URL(dir, web), { recursive: true, force: true });
  cpSync(new URL(dir, brand), new URL(dir, web), { recursive: true });
}
console.log('Copied brand templates and assets into studio/web/.');
