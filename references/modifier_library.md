# Modifier Library

Use this in Stage 2 (matrix generation) to pick up to 15 root searches per seed term.
Don't use all of these every time — pick the ones that fit the seed.

## Audience modifiers — `[seed] for [audience]`

**Creative**: artists, photographers, illustrators, musicians, writers, authors, designers, makers, crafters
**Service businesses**: therapists, counsellors, coaches, consultants, accountants, lawyers, tutors
**Trades**: plumbers, electricians, builders, decorators, cleaners, gardeners, flooring contractors, roofers
**Food/hospitality**: restaurants, cafes, bars, food trucks, caterers, bakers, B&Bs
**Health/fitness**: personal trainers, yoga instructors, nutritionists, physios, gyms, dentists, vets
**Property/real estate**: estate agents, landlords, property developers, mortgage brokers
**Religious/community**: churches, charities, non-profits, community groups, schools, clubs
**Business size**: small business, startups, solopreneurs, freelancers, agencies, enterprise
**Commerce**: ecommerce, dropshippers, resellers, Etsy sellers, Amazon sellers
**Niche groups**: students, retirees, expats, immigrants, content creators, influencers

## Use-case modifiers — `[seed] for [use case]`

portfolio, ecommerce, booking, blog, membership, directory, landing page, lead magnet,
event, course, podcast, newsletter, community, marketplace, comparison site, review site

## Constraint modifiers

**Without**: without coding, without design skills, without a developer, without money
**Free/cheap**: free [seed], cheapest [seed], [seed] free trial, [seed] under £10
**Speed**: quick [seed], 5-minute [seed], same-day [seed]
**Privacy/ethics**: no-tracking [seed], GDPR-compliant [seed], ethical [seed]
**Geographic**: UK [seed], London [seed], [seed] for UK businesses

## Intent modifiers

**Comparison (high commercial)**:
- `[seed] vs [competitor]`
- `best [seed]`
- `top 10 [seed]`
- `cheapest [seed]`
- `easiest [seed]`
- `[seed] alternatives`
- `[brand] alternative`

**How-to (info intent)**:
- `how to use [seed]`
- `how to build [output] without [seed]`
- `[seed] tutorial`
- `[seed] for beginners`

**Problem/pain (high SaaS intent)**:
- `[seed] not working`
- `[seed] vs hiring`
- `is [seed] worth it`
- `why [seed] is bad`
- `[seed] mistakes`

**Question framing (PAA-friendly when PAA still exists)**:
- `what is the best [seed]`
- `which [seed] should I use`
- `is [seed] free`
- `does [seed] do [feature]`

## Geographic priors (UK indie dev bias)

Default to UK-flavoured searches when relevant:
- `&gl=uk` query param in Google URL
- Include `uk` in some modifier variants
- Currency: £ not $
- Watch for UK-specific competitors (Tooltester is German, Expert Market is UK)

## When to skip a modifier branch

Don't include a modifier in the matrix if any of these are true:
- The combination is grammatically nonsensical (e.g. `website builder for cricket bats`)
- The seed already implies the modifier (e.g. don't add `free` to `free website builder`)
- The niche is obviously dead (e.g. don't search `MySpace for artists`)
- The audience is too narrow to monetise (e.g. `website builder for left-handed pottery teachers`)

The skill should show the matrix to the user before scraping so they can prune.
