// LOCAL TESTING ONLY: in-memory stand-in for db.js. Pass as env.__db.
export function makeDb(posts = {}) {
  const store = { posts: new Map(), buffer: new Map(), config: new Map() };
  const logs = [];
  let t = 1;
  for (const [id, data] of Object.entries(posts)) store.posts.set(id, { id, rev: 1, updatedAt: t++, data: { ...data } });
  const coll = (c) => store[c] || (store[c] = new Map());
  return {
    store, logs,
    async getDoc(_e, c, id) { const x = coll(c).get(id); return x ? structuredClone(x) : null; },
    async getState() {
      return { posts: [...store.posts.values()].map((x) => structuredClone(x)), briefs: [], ideas: [], buffer: store.buffer.get('status')?.data || {} };
    },
    async putDoc(_e, c, id, data) { const d = { id, rev: 1, updatedAt: t++, data: structuredClone(data) }; coll(c).set(id, d); return d; },
    async patchDoc(_e, c, id, rev, set) {
      const cur = coll(c).get(id);
      if (!cur) throw new Error('NotFound');
      if (rev != null && rev !== cur.rev) throw new Error('Conflict');
      for (const [k, v] of Object.entries(set)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && v.__delete__ === true) delete cur.data[k]; else cur.data[k] = structuredClone(v);
      }
      cur.rev++; cur.updatedAt = t++;
      return structuredClone(cur);
    },
    async log(_e, who, action, c, id, detail) { logs.push({ who, action, c, id, detail }); },
  };
}
