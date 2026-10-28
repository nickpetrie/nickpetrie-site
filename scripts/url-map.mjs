// URL decisions shared by the importer and the redirect generator.

// Pages get shorter, clearer addresses. The old ones 301 to these.
export const pageSlugMap = {
  'nick-petrie': 'about',
  'mentoring-media-innovation-news-product': 'mentoring',
  'contact-colophon': 'contact',
};

// Posts that went out as When News Meets Product issues, with their old beehiiv slug.
export const wnmpIssues = {
  'a-golden-opportunity': { issue: 1, beehiivSlug: 'golden-opportunity' },
  'stand-out-or-fade-away': { issue: 2, beehiivSlug: 'stand-fade-away' },
  'readers-readers-readers-readers-readers': { issue: 3, beehiivSlug: 'readers-readers-readers-readers-readers' },
  'gotta-get-structural': { issue: 4, beehiivSlug: 'gotta-get-structural' },
  'the-two-product-team-problem': { issue: 5, beehiivSlug: 'the-two-product-team-problem' },
  'bridge-roles-need-to-die': { issue: 6, beehiivSlug: 'bridge-roles-need-to-die' },
};

// Ghost tags that carried no content worth a page of their own.
export const legacyTagSlugs = ['getting-started', 'news'];
