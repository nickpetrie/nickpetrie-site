// A small weekly backup of Studio's database: every doc plus the last 500 log rows, gzipped JSON in the
// media bucket. Four rolling copies (backups/studio-0..3.json.gz), so storage never grows. Images are left
// out on purpose: cards can be redrawn from their saved specs, and posted ones live on LinkedIn.
//   weeklyBackup(env, now)  -> {key, bytes} | null   (runs on the first cron after 03:00 UTC on Sundays)
//   backupNow(env, now)     -> {key, bytes}

const SLOTS = 4;
const WEEK = 7 * 24 * 3600 * 1000;

export async function backupNow(env, now = Date.now()) {
  const docs = await env.DB.prepare('SELECT collection, id, data, rev, updated_at, updated_by FROM docs ORDER BY collection, id').all();
  const log = await env.DB.prepare('SELECT at, who, action, collection, doc_id, detail FROM log ORDER BY at DESC LIMIT 500').all();
  const body = JSON.stringify({
    at: new Date(now).toISOString(),
    docs: docs.results.map((r) => ({ ...r, data: JSON.parse(r.data) })),
    log: log.results,
  });
  const gz = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const key = `backups/studio-${Math.floor(now / WEEK) % SLOTS}.json.gz`;
  await env.MEDIA.put(key, gz, { httpMetadata: { contentType: 'application/gzip' }, customMetadata: { at: new Date(now).toISOString() } });
  return { key, bytes: gz.byteLength };
}

export async function weeklyBackup(env, now = Date.now()) {
  const d = new Date(now);
  // The cron runs every 15 minutes; only the 03:00 to 03:14 run on a Sunday makes a backup.
  if (d.getUTCDay() !== 0 || d.getUTCHours() !== 3 || d.getUTCMinutes() >= 15) return null;
  return backupNow(env, now);
}
