# Peshawar Cricket Club

A mobile-first Next.js application for cricket team discovery, owner-reviewed registration, match coordination, live scoring and tournament administration in Peshawar.

## What is included

- Next.js App Router + TypeScript
- Responsive desktop navigation and mobile bottom navigation
- Light/dark/system theme switcher
- Home, teams, players, matches, live scores, chat, tournaments, login and private administration
- Search-engine metadata, `robots.txt`, sitemap and PWA manifest
- Supabase browser/server client helpers
- Supabase/PostgreSQL workflows for team registration, match invitations, chat, tournament entries and admin-scored fixtures
- Persistent user and owner notifications, with opt-in Web Push integration

**Important:** This project is not production-verified. Database changes are additive migrations and have not been applied or exercised against the production Supabase project in this workspace. Build success does not prove that database workflows, Web Push, Vercel Cron, device installation or owner authorization work end-to-end. Validate the migrations on a disposable Supabase project before production.

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project for backend features (optional for previewing the UI)

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

The public preview works without Supabase credentials. Sign-in requires the Supabase URL and public anon key. Google and Facebook additionally require provider credentials and redirect URLs in Supabase; email confirmation behavior depends on your Supabase Auth settings.

For private administration, configure `ADMIN_USERNAME`, a strong `ADMIN_PASSWORD`, and a random `ADMIN_SESSION_SECRET` in `.env.local` and in the deployment environment. These values must not be committed or pasted into chat. The username/password login alone does not grant Owner privileges; team approvals require a Supabase account explicitly assigned `owner_role='owner'` and access through the private `OWNER_CONTROL_ROUTE`. Set `SUPABASE_SERVICE_ROLE_KEY` only as a server-side environment variable for full private reports and management data. Never use the service-role key in the browser or a `NEXT_PUBLIC_` variable.

## Configure Supabase

1. Create a project at https://supabase.com and copy its Project URL and anon/public key from Project Settings → API into `.env.local`.
2. For a new database, run `supabase/schema.sql`, then apply the migrations below in order. For an existing database, first verify which migrations have already been applied; do not rerun the base schema blindly. Apply outstanding migrations in this order: `supabase/auth-profile-migration.sql`, `supabase/team-workflow-migration.sql`, `supabase/owner-control-center-migration.sql`, `supabase/admin-pwa-migration.sql`, `supabase/admin-session-review-migration.sql`, and `supabase/pcc-platform-migration.sql`. Review each SQL file and test the full sequence against a disposable project before production.
3. In Authentication → Providers, enable Email, Google, and Facebook as desired. Configure Google and Facebook OAuth credentials in their provider consoles and enter them in Supabase; their OAuth callback URL is shown in Supabase's provider settings. Only after each provider is enabled, set its `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` or `NEXT_PUBLIC_FACEBOOK_OAUTH_ENABLED` flag to `true` in the hosting environment and redeploy. Until then, the button shows a friendly setup message instead of opening Supabase's raw “provider is not enabled” error.
4. In Authentication → URL Configuration, set the deployed site as the Site URL and add `https://YOUR_DEPLOYED_HOST/auth/callback` (and the local development callback) to the allowed redirect URLs.
5. Choose whether email sign-ups require confirmation. If enabled, configure a reliable SMTP sender in Supabase; the selected photo is uploaded after the user confirms and signs in. Users can update their name/photo under App settings.
6. Create the first administrator through a trusted, controlled process. Do not allow public role selection or client-side role changes.

### Team registration and approvals

Signed-in users can register a team from `/teams` with a name, area and 8–12 player roster. The first player is the captain. Registration and roster creation run in one database transaction and start pending owner approval; only an authenticated owner can approve or reject a team. Approved teams appear in the public directory. Captains can view rejection feedback, correct their own rejected application, and resubmit it for review; the database function checks captain ownership and rejected status and preserves existing public Player IDs. The workflow migration removes direct captain team inserts/status updates and grants registration through validated database functions.

For ordinary administrator access, grant the `admin` role only from the Supabase SQL Editor after verifying the account ID:

```sql
update public.profiles
set role = 'admin'
where id = 'THE_VERIFIED_AUTH_USER_UUID';
```

Never run this with an unverified ID or expose the service-role key. Normal Admin access does not confer Owner privileges. Team approval requires the separately configured `owner_role='owner'` account and a valid owner session. Test owner-versus-admin access using separate accounts before accepting public registrations.

The sign-up form enforces a six-character minimum password, asks for a display name, and accepts an optional profile photo. Photos are previewed and cropped in the browser, then decoded, dimension-checked, cropped, and compressed again by the authenticated `/api/media/upload` endpoint before storage. Source images are limited to 10 MB and 40 megapixels; processed WebP files are limited to 180 KB. The public-read avatar bucket means anyone who has an avatar URL can view that profile picture. The endpoint stores uploads only under the signed-in user's folder and uses the user's Supabase session—never put a Supabase service-role key in browser code.

### Player account invitations

The captain can create a cryptographically random, single-use access code for a roster player. The database stores only its SHA-256 hash, restricts invite creation to the approved team's captain, expires codes after seven days, and permits each account to claim one Player ID. The player first creates or signs into their own email/password account, then redeems their Player ID and code at `/player-access`; no team-shared password is created. After linking, the player can sign in with their Player ID and personal password and open `/player`. Password recovery still uses the email address linked to the account. Player ID sign-in requires `SUPABASE_SERVICE_ROLE_KEY` on the server to resolve the private account mapping; it is never sent to the browser.

### Tournament fixtures, results, and standings

The Owner dashboard can schedule tournament fixtures only between teams with approved entries, and only within the tournament date range. Completed fixtures require both scores. The public tournament detail page displays published fixtures, results, approved participants, and standings. Standings are entered by an Owner; the server verifies that each team is an approved participant and that played matches equal wins, losses, ties, and no-results. Points and net run rate still need to be maintained according to the tournament's rules; they are not calculated automatically from fixture scores.

### Match arrangement polls

After an invitation is accepted, either participating captain can open one active poll with 2–8 date, time, and venue options. Captains can vote once in each category, change votes only when the poll permits it, and see vote totals refresh while the poll is open. Either captain can close the poll after each category receives a vote; ties use the poll's option order. Both captains must still confirm the resulting arrangement before the scheduled fixture is created. Voting currently uses the app's authenticated captain accounts; player-member accounts are not yet implemented.

Player accounts can now be linked to Player IDs, but player-member poll voting and delegated chat participation are still not enabled.

### Chat moderation reports

Members of a private conversation can report another member's message once and provide a reason. The database verifies conversation membership and prevents reporting one's own message. Reports are visible only in the authenticated Owner dashboard under **Messages**, where an Owner can resolve or dismiss each report with an optional private note. The PCC platform migration is required; moderation actions are recorded in `admin_logs`.

## Production verification still required

Before launch, test the full migration sequence and every workflow with separate player, captain, owner and ordinary-admin accounts. The platform migration adds server-validated scoring, innings completion, last-ball undo, chat reports, and audit records; tournament decisions, match invitations and chat also depend on database-side authorization. Confirm that these policies and security-definer functions behave correctly on the actual Supabase PostgreSQL version. Chat report delivery and Owner review remain unverified until the migration is applied; captain transfer, general team-membership management, account recovery operations and a complete application-level owner-management suite remain outside the verified scope. Do not rely on a client-provided role or user ID.

## Deploy to Vercel

1. Push the project to a private GitHub repository.
2. Import the repository in https://vercel.com.
3. Add the environment variables from `.env.local` in Vercel Project Settings → Environment Variables.
4. Set `NEXT_PUBLIC_SITE_URL` to your deployed Vercel URL.
5. Deploy and test the production build. Configure a strong `CRON_SECRET`; `vercel.json` schedules match reminders every five minutes after the PCC platform migration is applied.
6. Add a custom domain later and update DNS as instructed by Vercel.

## PWA installation

The app manifest uses the included 192×192, 512×512, maskable and Apple touch icons. A same-origin service worker provides an offline fallback page, caches app static assets, and handles notification clicks. The install prompt is browser-controlled: supported browsers show an optional banner, and iOS Safari shows Add to Home Screen instructions. Users can also install from the mobile menu or **Settings**. Dismissing the banner stores a local preference; installing hides it. **PWA installation is not an APK download or an App Store installation.**

The Share App button shares the current website origin and, when supported, the club icon. It falls back to copying the URL. Set `NEXT_PUBLIC_SITE_URL` to the canonical deployed URL for metadata, sitemap and robots output; share links use the actual origin currently open in the browser.

### Public information and Search Console

The public footer links to About, Contact, Privacy Policy and Terms and Conditions. Set `NEXT_PUBLIC_CONTACT_EMAIL` only to a monitored club address. The policy pages describe the current intended behavior but should be reviewed by the club and qualified local counsel before production use.

To verify a domain in Google Search Console, set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to the verification token from Search Console and redeploy; Next.js emits Google's HTML verification meta tag. The site map and robots route use `NEXT_PUBLIC_SITE_URL` as their canonical base. Google AdSense placements are disabled by default. After approval, an owner can configure the publisher and slot IDs in the Admin dashboard's **Settings**; only enabled placements on the homepage and public tournament directory load Google's official script. No placeholder IDs are provided. Review the privacy notice and applicable consent requirements before enabling live ads.

### Web Push setup

Push delivery requires a deployed HTTPS origin (localhost is suitable for local development), a signed-in Supabase user, and server-side VAPID credentials:

1. Run the push table and RLS additions in `supabase/schema.sql` in the Supabase SQL editor.
2. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Set the public key as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; keep `VAPID_PRIVATE_KEY` server-only.
3. Configure `VAPID_SUBJECT` to a valid `mailto:` contact or HTTPS URL, and set a strong random `CRON_SECRET`. Configure `SUPABASE_SERVICE_ROLE_KEY` on the server only; never expose it with a `NEXT_PUBLIC_` prefix.
4. Signed-in users can opt in and manage per-category preferences at `/settings`. The browser permission request is made only after the user presses **Enable alerts**.
5. Match invitations and live-score actions dispatch opt-in events through the server-side sender. After applying `supabase/pcc-platform-migration.sql`, the Vercel Cron at `/api/cron/match-reminders` claims confirmed fixtures due within 20 minutes in the `Asia/Karachi` timezone and saves persistent in-app notifications. Configure `CRON_SECRET` in Vercel so scheduled invocations are authenticated. The protected sender can also accept trusted events at `POST /api/push/send` with `Authorization: Bearer <CRON_SECRET>` and JSON shaped like:

   ```json
   {
     "category": "match_reminder",
     "userIds": ["authenticated-user-uuid"],
     "title": "Match reminder",
     "body": "Your fixture starts soon.",
     "url": "/matches"
   }
   ```

   Supported categories are `match_request`, `fixture_accepted`, `match_reminder`, and `live_score`. The dispatcher checks each user's preferences and removes expired push subscriptions. Never call this secret-protected route from browser code.

The reminder scheduler and live-score push workflows depend on the migration, cron configuration, VAPID credentials, a running deployed HTTPS app, opted-in user subscriptions and category preferences. Push can fail while the in-app reminder is still saved. Inspect the cron response and verify delivery on physical Android/iOS devices; a successful build or an in-app notification is not proof of Web Push delivery. Signed-in push subscriptions require Supabase email or OAuth providers and redirect URLs to be configured first.

### Device verification checklist

- On Android Chrome over HTTPS, verify the optional install banner, browser install prompt, installed standalone state, and that dismissal suppresses the banner.
- On iPhone/iPad Safari, choose **Share → Add to Home Screen → Add**; verify the home-screen icon and standalone launch. iOS Web Push is available only on supported iOS versions for a home-screen web app.
- Confirm Share App sends the deployed origin (and icon where target support permits); otherwise confirm Copy Link.
- Confirm `/<site>/manifest.webmanifest`, all manifest icons, `/sw.js`, the offline fallback, and shortcuts load on the deployed host.
- On an authenticated device with VAPID and database setup complete, opt in, verify each notification preference, deliver a test event through the protected dispatcher, and verify tapping a notification opens its same-origin URL.

Real Android/iOS device installation and Web Push behavior require a deployed HTTPS site and physical devices; they are not validated by a local production build alone.

### Separate admin app and owner notifications

The private `/admin` dashboard has its own `PCC Admin` manifest and `/admin`-scoped service worker, so it can be installed separately from the public club app. It includes team/player details, approvals, fixtures, live ball-by-ball scoring with undo, tournament management, reports, notifications, messages, and system/light/dark appearance. Protected data and writes require the separately signed Owner session established through the secret owner route; a normal Admin username/password session does not grant Owner access. Protected data also requires `SUPABASE_SERVICE_ROLE_KEY` on the server; the service-role key must never be exposed to the browser. Scoring requires the PCC platform migration.

To enable owner push notifications for new team registration requests:

1. Apply the migrations in the order listed in **Configure Supabase**, including `supabase/admin-pwa-migration.sql` before `supabase/pcc-platform-migration.sql`.
2. Generate a VAPID pair using `npx web-push generate-vapid-keys`. Set the public key as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key as server-only `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to a valid `mailto:` address or HTTPS URL.
3. Set `SUPABASE_SERVICE_ROLE_KEY` and a long random `OWNER_PUSH_SECRET` in the production server environment. Store the exact same `OWNER_PUSH_SECRET` in Supabase Vault under the name `pcc_admin_push_secret`. For example, from a trusted SQL Editor session, use `select vault.create_secret('REPLACE_WITH_THE_SAME_RANDOM_SECRET', 'pcc_admin_push_secret');`; do not commit the value or paste it into public chat.
4. Redeploy after setting the production variables. Sign into `/admin` on the mobile device, install `PCC Admin`, open the installed app, enable notifications in **Settings**, and send a test notification. New team-registration owner notifications are sent by the database hook when the full setup is in place.

If any prerequisite is missing, the dashboard reports the unavailable capability rather than simulating successful delivery. Actual Android/iOS push delivery must be verified on a device with notification permission and network connectivity.

## Weekly expiry/reset

The weekly expiry/reset worker for temporary match requests is not implemented. Match reminders use a separate five-minute Vercel Cron. If implementing expiry, use a protected, idempotent worker in the `Asia/Karachi` timezone, expire only temporary requests, and archive rather than delete historical fixtures and scorecards. Confirm your Vercel plan supports each cron frequency.

## Google Search Console

1. Deploy the site first.
2. Add the deployed domain/property in Google Search Console.
3. Verify ownership using the DNS TXT record at your domain registrar, or use an available HTML verification method.
4. Submit `https://YOUR_DOMAIN/sitemap.xml`.
5. Monitor indexing, Core Web Vitals and search queries.

The sitemap and robots routes are generated by Next.js. Update `NEXT_PUBLIC_SITE_URL` to your canonical production URL.

## Google AdSense

AdSense approval cannot be guaranteed or automated by this project. After launch:
1. Publish useful, original cricket content and complete About, Contact, Privacy and Terms pages.
2. Apply through your own Google AdSense account.
3. Add the publisher ID and ad slot IDs after approval.
4. Publish a valid `ads.txt` entry supplied by Google.
5. Keep ad placements away from scoring controls and misleading click targets.

Do not add placeholder publisher IDs or simulate ad clicks/traffic.

## Branding

Application name: **Peshawar Cricket Club**  
Tagline: **Play • Connect • Compete**  
Launch city: **Peshawar, Pakistan**

Brand colors: navy `#071B36`, gold `#D4AF37`, white `#FFFFFF`, and cricket red `#D62828`. The supplied crest artwork is available as `public/logo.svg` and transparent `public/logo.png`; circular app icons are `public/app-icon-192.png` and `public/app-icon-512.png`, with Android maskable circle-safe versions, `public/favicon.png`, and `public/apple-touch-icon.png`. The public and separate Admin PWA manifests use these same PCC mobile icons.

To regenerate the asset sizes from the committed crest and app icon, run `node scripts/generate-icons.js`. To re-import the original combined crest-and-icon artwork, pass its image path to the same command.

## Private owner control center

The owner control center is not part of public navigation, settings, teams, profiles, robots hints, or the sitemap. It is served only by a random route configured in Vercel as `OWNER_CONTROL_ROUTE`. The route performs server-side Supabase session and `owner_role='owner'` checks; normal admin accounts do not receive owner privileges.

Apply `supabase/owner-control-center-migration.sql` in the migration order above. Set exactly one verified account's `owner_role` through a secure SQL session:

```sql
update public.profiles p
set owner_role = 'owner'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('THE_VERIFIED_OWNER_EMAIL');
```

Generate a cryptographically random route value of at least 32 characters, set it only as the server-side `OWNER_CONTROL_ROUTE` production environment variable in Vercel, and redeploy. Never add the route to public navigation or commit or share the environment value. Owner access is at:

`https://peshawarcricketclub.com/[OWNER_CONTROL_ROUTE]`

Sign into the public PCC site with the verified Owner account first, then open the configured private route. It validates the Supabase Owner role and starts the protected `/admin` session. Pending team registrations appear under **Pending approvals**. The Owner dashboard refreshes visible data every 20 seconds and has a manual **Refresh** button. If registrations still do not appear, verify that `owner-control-center-migration.sql` and `pcc-platform-migration.sql` were applied successfully, the signed-in Supabase user has `owner_role='owner'`, and the registration RPC returned success. The dashboard surfaces database setup errors rather than treating them as successful approvals.
