// Site-wide facts. These feed the page chrome, meta tags and structured data,
// so search engines and AI assistants get one consistent description of Nick.
export const site = {
  url: 'https://www.nickpetrie.co',
  name: 'Nick Petrie',
  title: 'Nick Petrie: news product, newsroom strategy and mentoring',
  description:
    'Nick Petrie writes about news product, newsroom strategy and digital change, and mentors and coaches people in news product. Digital Director at The i Paper.',
  locale: 'en_GB',
  lang: 'en-GB',
  email: 'nick@nickpetrie.co',
  nav: [
    { href: '/writing/', label: 'Writing' },
    { href: '/newsletter/', label: 'Newsletter' },
    { href: '/mentoring/', label: 'Mentoring' },
    { href: '/about/', label: 'About' },
  ],
  social: {
    linkedin: 'https://www.linkedin.com/in/nick-elliot-petrie/',
    x: 'https://x.com/petren',
    mastodon: 'https://macaw.social/@petren',
  },
} as const;

// Home page "The hills I'll die on", in order.
export const featured = ['bridge-roles-need-to-die', 'the-two-product-team-problem', 'readers-readers-readers-readers-readers'];

// Public values for third-party scripts. Empty turns the feature off.
export const services = {
  // Cloudflare Web Analytics (cookie-free). The token is public: it appears in every page.
  analyticsToken: '',
  // Cloudflare Turnstile site key for the sign-up forms. The secret is the Worker secret TURNSTILE_SECRET.
  turnstileSiteKey: '',
};

export const booking = 'https://savvycal.com/NickPetrie/0977e9aa';

export const newsletter = {
  name: 'When News Meets Product',
  short: 'WNMP',
  promise: 'For people trying to change news organisations from the inside.',
  url: `${site.url}/newsletter/`,
  description: 'Essays on the strategies, structures and outcomes of the news industry’s digital transformation, from a practitioner. By Nick Petrie.',
} as const;

export const person = {
  '@type': 'Person',
  '@id': `${site.url}/#person`,
  name: 'Nick Petrie',
  url: `${site.url}/about/`,
  jobTitle: 'Digital Director',
  worksFor: { '@type': 'Organization', name: 'The i Paper', url: 'https://inews.co.uk/' },
  knowsAbout: [
    'News product management',
    'Newsroom strategy',
    'Digital transformation in news media',
    'Subscription strategy',
    'Audience data and insights',
    'Mentoring',
    'Coaching',
  ],
  sameAs: Object.values(site.social),
};
