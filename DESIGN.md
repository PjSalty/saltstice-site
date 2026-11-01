# Site design: IA and journeys

The site is an ops console for one person's production homelab. Every surface answers one of three visitors, in this order of priority.

## Visitors and journeys

1. Recruiter or hiring manager, 60 seconds.
   Home: who (one line, plus the lab as a live schematic) -> proof (lab numbers from `data/lab.yaml`, shipped providers with registry downloads at build time) -> depth (three postmortems, latest writing) -> contact (GitHub, RSS, security contact in the footer and About).
   Exits that matter: /projects/, /incidents/, /lab/, /about/.
2. Engineer arriving from search on one post.
   Article: title, type, date, read time, topics, sticky contents with scroll spy, code with language label and copy, anchors, then related posts (shared tags), previous and next, topic links.
   Incidents add a postmortem header: date, areas, and the symptom, root cause, fix path built from the headings that exist.
3. User of terraform-provider-truenas or -unifi.
   Project page opens with a registry strip: version, downloads, license, registry and docs and source buttons, and an install snippet. The write-up follows.

## Navigation

Primary: Writing, Incidents, Projects, Lab, About, plus search and theme toggle.
Telemetry is merged into Lab (a live panel on Lab links to it). Topics, tags and types are reached from the Writing filters and from article footers. Archive and Start here live in the footer.
Writing is one index for posts and incidents with a type filter and topic chips.

## URL contract

Nothing moves. /writing/, /incidents/, /projects/, /lab/, /telemetry/, /about/, /topics/, /tags/, /types/, /search/, /archives/, /start-here/, every post, incident and project permalink, /index.xml, /index.json, sitemap, robots, security.txt.

## System

- Type: Geist Serif for display, Geist for UI and prose, Geist Mono for labels and data. Self-hosted woff2, OFL, see static/fonts/README.md.
- Color: warm salt paper and ink in light, cool near-black in dark, one signal orange accent, a cool blue for schematic lines, green and amber and red only for status.
- Grid: 1200px wrap, 12 columns, 24px gutters (16px on phones), 68ch reading column.
- Cover art: deterministic inline SVG from title and tags, colored by content type.
- Motion: CSS only, off under prefers-reduced-motion.
