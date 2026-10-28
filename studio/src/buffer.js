// Tiny GraphQL client for Buffer's public API.
// Endpoint and auth confirmed against developers.buffer.com:
//   POST https://api.buffer.com   Authorization: Bearer <key>   Content-Type: application/json
// Rate limit: 100 requests / 15 min, so callers should keep a run under ~20 calls.

export const ENDPOINT = 'https://api.buffer.com';
// Nick's own Buffer organisation and LinkedIn channel come from wrangler.jsonc vars; there are no defaults.

const budgets = new WeakMap(); // env object -> {used, max}

/** Count calls made with this exact env object; throws once `max` is exceeded. */
export function startBudget(env, max = 20) {
  budgets.set(env, { used: 0, max });
}
export function callsUsed(env) {
  return budgets.get(env)?.used ?? 0;
}

const need = (v, name) => { if (!v) throw new Error(`${name} is not set`); return v; };
const channelId = (env) => need(env.BUFFER_CHANNEL_ID, 'BUFFER_CHANNEL_ID');
const orgId = (env) => need(env.BUFFER_ORG_ID, 'BUFFER_ORG_ID');

async function gql(env, operationName, query, variables) {
  const b = budgets.get(env);
  if (b) {
    if (b.used >= b.max) throw new Error(`Buffer call budget of ${b.max} reached (rate limit is 100 per 15 minutes)`);
    b.used++;
  }
  if (!env.BUFFER_API_KEY) throw new Error('BUFFER_API_KEY is not set');
  const doFetch = env.__fetch || fetch;
  const res = await doFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.BUFFER_API_KEY}` },
    body: JSON.stringify({ operationName, query, variables }),
  });
  let json;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = null; }
  if (res.status === 429) throw new Error('Buffer rate limit hit (429); try again later');
  if (!res.ok) throw new Error(`Buffer HTTP ${res.status}: ${(json?.errors?.[0]?.message) || text.slice(0, 200)}`);
  if (json?.errors?.length) throw new Error(`Buffer: ${json.errors.map((e) => e.message).join('; ')}`);
  if (!json?.data) throw new Error('Buffer returned no data');
  return json.data;
}

const POST_FIELDS = `id status dueAt sentAt text isCustomScheduled shareMode
  assets { type source }`;

function checkPayload(payload, what) {
  if (!payload) throw new Error(`Buffer ${what}: empty response`);
  if (payload.message && !payload.post && !payload.id) throw new Error(`Buffer ${what} failed: ${payload.message}`);
  return payload;
}

/** AssetInput list from a post's approved media. A carousel goes to LinkedIn as one PDF document. */
export function buildAssets({ type, images = [], document }) {
  if (type === 'text') return [];
  if (type === 'carousel') {
    if (!document?.url) throw new Error('A carousel needs its PDF');
    return [{ document: { url: document.url, title: document.title || 'Slides', thumbnailUrl: document.thumbnailUrl } }];
  }
  if (!images.length) throw new Error('A post needs at least one image');
  return images.map((im) => ({ image: { url: im.url, metadata: { altText: im.alt || '' } } }));
}

/**
 * mode: 'addToQueue' (default) or 'customScheduled' (needs dueAt).
 * type: image | carousel | text. firstComment: LinkedIn's first comment (often the link).
 * draft: save as a Buffer draft (tests only). Returns {id, dueAt, status}.
 */
export async function createPost(env, { text, assets, type = 'image', firstComment, mode = 'addToQueue', dueAt, draft = false }) {
  if (mode === 'customScheduled' && !dueAt) throw new Error('customScheduled needs dueAt');
  if (!['image', 'carousel', 'text'].includes(type)) throw new Error(`Unknown post type "${type}"`);
  const input = {
    channelId: channelId(env),
    schedulingType: 'automatic',
    mode,
    text,
    assets,
    aiAssisted: true,
    metadata: { linkedin: firstComment ? { firstComment } : {} },
  };
  if (mode === 'customScheduled') input.dueAt = dueAt;
  if (draft) input.saveToDraft = true;
  const data = await gql(env, 'CreatePost', `mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id status dueAt } }
      ... on MutationError { message }
    }}`, { input });
  const p = checkPayload(data.createPost, 'createPost');
  if (!p.post) throw new Error(`Buffer createPost failed: ${p.message || p.__typename}`);
  return p.post;
}

export async function deletePost(env, id) {
  const data = await gql(env, 'DeletePost', `mutation DeletePost($input: DeletePostInput!) {
    deletePost(input: $input) {
      __typename
      ... on DeletePostSuccess { id }
      ... on MutationError { message }
    }}`, { input: { id } });
  const p = data.deletePost;
  if (p?.message) throw new Error(`Buffer deletePost failed: ${p.message}`);
  return { id: p?.id || id };
}

/** Returns the post, or null if Buffer says it no longer exists. */
export async function getPost(env, id) {
  try {
    const data = await gql(env, 'GetPost', `query GetPost($input: PostInput!) { post(input: $input) { ${POST_FIELDS} } }`, { input: { id } });
    return data.post || null;
  } catch (e) {
    if (/not ?found|does not exist|no post/i.test(e.message)) return null;
    throw e;
  }
}

/** statuses e.g. ['scheduled','sending']. One page (up to 100), soonest first. */
export async function listPosts(env, statuses = ['scheduled', 'sending']) {
  const data = await gql(env, 'ListPosts', `query ListPosts($input: PostsInput!) {
    posts(first: 100, input: $input) { edges { node { ${POST_FIELDS} } } pageInfo { hasNextPage } }
  }`, {
    input: {
      organizationId: orgId(env),
      filter: { channelIds: [channelId(env)], status: statuses },
      sort: [{ field: 'dueAt', direction: statuses.includes('sent') ? 'desc' : 'asc' }],
    },
  });
  return (data.posts?.edges || []).map((e) => e.node);
}

/** The latest posts Buffer has sent, newest first. */
export async function recentSent(env, n = 12) {
  const data = await gql(env, 'RecentSent', `query RecentSent($input: PostsInput!) {
    posts(first: ${Number(n) || 12}, input: $input) { edges { node { id sentAt text externalLink assets { type source thumbnail ... on ImageAsset { image { altText } } } } } }
  }`, {
    input: { organizationId: orgId(env), filter: { channelIds: [channelId(env)], status: ['sent'] }, sort: [{ field: 'dueAt', direction: 'desc' }] },
  });
  return (data.posts?.edges || []).map((e) => e.node);
}

/** Channel with postingSchedule [{day, times, paused}] and timezone. */
export async function getChannel(env) {
  const data = await gql(env, 'GetChannel', `query GetChannel($input: ChannelInput!) {
    channel(input: $input) { id name timezone isQueuePaused postingSchedule { day times paused } }
  }`, { input: { id: channelId(env) } });
  return data.channel;
}
