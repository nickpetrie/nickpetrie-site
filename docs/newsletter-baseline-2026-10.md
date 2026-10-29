# When News Meets Product: baseline before the move (29 October 2026)

Pulled from beehiiv's connector before the switch to nickpetrie.co and the Free plan. Aggregate numbers only: no subscriber names or addresses (those stay in beehiiv; export a CSV from beehiiv if you need them, and keep it out of git).

## The list

- **493 active subscribers.** 506 joined all time, 13 left.
- **All-time open rate 62.9%, click rate 13.1%.** High for any newsletter. Opens are inflated by Apple Mail privacy protection, so treat clicks and replies as the truer signal.
- **Growth comes in steps, not a slope.** Launch (Oct 2023, +165), February 2024 (+128, after "Stand out or fade away"), October 2024 (+72). In between, two to five a month. Publishing, and sharing on LinkedIn, is what grows it.

| Month (count at start) | Active |
|---|---|
| Oct 2023 | 165 |
| Feb 2024 | 344 |
| Oct 2024 | 430 |
| Jan 2025 | 433 |
| Jan 2026 | 470 |
| 29 Oct 2026 | 493 |

## Where subscribers come from

| Source | Subscribers |
|---|---|
| LinkedIn (desktop, Android app, lnkd.in) | 237 (47%) |
| Direct (no referrer: links in email, messages, typed) | 178 |
| beehiiv embed form | 33 |
| nickpetrie.co (Ghost site links) | 10 |
| Imported | 10 |
| News Product Alliance email | 9 |
| journalistspaythemselves.com | 4 |
| beehiiv recommendation (mediatech.report) | 4 |
| Google, Slack, X, beehiiv | 6 |
| nickpetrie.co sign-up form (new site, API) | 2 (tests) |

LinkedIn is the channel. The old site sent almost nobody (10); the new site has a sign-up form on every page, so watch `api: nickpetrie.co / website` grow.

## Issues

| Issue | Sent | Recipients | Delivered | Open rate | Click rate | Unsubs |
|---|---|---|---|---|---|---|
| A golden opportunity? | 19 Oct 2023 | 171 | 99.4% | 56.5% | 22.9% | 0 |
| Stand out or fade away | 15 Jan 2024 | 321 | 99.1% | 62.9% | 15.0% | 1 |
| Readers readers readers readers readers | 25 Mar 2024 | 353 | 97.5% | 64.8% | 18.4% | 3 |
| Gotta get structural | 16 Dec 2024 | 434 | 96.1% | 67.9% | 12.4% | 4 |
| The two product team problem | 20 Jan 2025 | 431 | 95.1% | 61.7% | 11.1% | 0 |
| Bridge roles need to die | 23 Jan 2026 | 472 | 90.5% | 61.6% | 9.9% | 3 |

Delivery has slid from 99% to 90% as the list has aged: that's the bounced and dead addresses (see clean-up below), not the content.

## What readers click

- **Mentoring is a top-three link in four of six issues.** In "Bridge roles need to die" it was the most-clicked link (19 people, 7% of recipients). In "A golden opportunity?" and "Gotta get structural" it tied for first. Steady demand: keep a mentoring line in every issue.
- **Good outside links get clicked.** Next Gen News (23 people), People vs Algorithms on CNN (19), "Shipping the org chart" (17), Knight Lab on product thinking (11), Nieman Lab predictions (12).
- **Your own back catalogue gets some** ("Gotta get structural" from the next issue: 8).
- **Social profile links get a handful** (LinkedIn and X, 2 to 8 each).
- **"The two product team problem" carried 1440 ads** from beehiiv's ad network (total earnings, all time: $3). Turn the ad network off in beehiiv if you don't want other brands' ads in your issues.

## Clean-up segments (in beehiiv)

| Segment | Members |
|---|---|
| Hard bounced (permanently suppressed) | 43, still active: remove before the next send |
| Bounced and never opens | 29 |
| No opens in the last 3 issues | 99 |
| Engaged readers (opened in the last 700 days) | 381 |
| Joined since the last issue | 24 |

## Old beehiiv web addresses

Issues also lived on beehiiv's site (`nicks-newsletter-20df20.beehiiv.com/p/<slug>`), with two different slugs from nickpetrie.co: `stand-fade-away` and `golden-opportunity`. Those pages aren't on your domain, so they can't be redirected from nickpetrie.co. If beehiiv's web hosting is switched off, they stop working.
