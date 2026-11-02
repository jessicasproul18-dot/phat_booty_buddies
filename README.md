# Phat Booty Buddies

A workout tracker for two. Set a weekly goal, snap a pic when you work out, nudge each other, and whoever misses their goal pays the wager.

Built with React + Vite, Supabase (database, sign-in, photo storage) and Vercel (hosting + push notifications). It installs to an iPhone home screen as an app (PWA).

## One-time setup

1. **Supabase → SQL Editor → New query**: paste all of `supabase/schema.sql` and click **Run**.
2. **Supabase → Authentication → Sign In / Providers → Email**: turn off **Confirm email**.
3. Put your Supabase **Project URL** and **anon key** in `src/config.js`.
4. **Vercel → Add New → Project**: import this GitHub repo. Framework preset: Vite. Before deploying, add these **Environment Variables**:
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → `service_role` (secret, never commit it)
   - `VAPID_PRIVATE_KEY`: from the setup notes file
   - `VAPID_SUBJECT`: `mailto:` plus your email
5. Open the Vercel link on each phone in Safari → Share → **Add to Home Screen**. Open the app from the home screen, sign up, pair up with the code, then Settings → **Turn on notifications**.

## Editing

- `src/App.jsx`: all the screens
- `src/styles.css`: colors and fonts (tokens at the top)
- `src/dates.js`: week, streak and photo logic
- `api/notify.js`: what the push notifications say
- `public/`: app icon, manifest, service worker

Run locally with `npm install` then `npm run dev`. Every push to `main` redeploys on Vercel.
