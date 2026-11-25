# Peshawar Cricket Club (PCC)

## Master Development Instructions for GitHub Copilot

**How to use this file:** Open your PCC project in VS Code, open GitHub
Copilot Chat in Agent Mode, and send this instruction:

> Read the entire `PCC_MASTER_DEVELOPMENT_PROMPT.md` file carefully from
> beginning to end. Treat it as the master project specification.
> Inspect my existing project first, then implement the requirements in
> the file in the existing codebase. Do not merely summarize the file or
> create a static prototype. Work systematically, preserve working
> functionality, run the application/build/tests, fix errors, and report
> what is complete and what still requires my credentials or
> authorization. Do not ask me to repeat requirements already written in
> the file.

------------------------------------------------------------------------

# MASTER DEVELOPMENT PROMPT

## Project

**Peshawar Cricket Club (PCC)** --- a complete cricket club management
platform consisting of a public website, responsive mobile experience,
installable PWA, captain/player dashboards, tournament management, match
coordination, notifications, and a Super Admin dashboard.

Act as a senior full-stack software architect, UI/UX designer, database
engineer, security engineer, SEO specialist, and automation developer.

Your mission is to transform my existing Peshawar Cricket Club project
into a fully functional, production-ready cricket club management
platform.

**Do not create only a frontend design, static demonstration, or
mockup.** Build real frontend and backend functionality, database
models, authentication, authorization, APIs, admin workflows,
notifications, image processing, and documentation.

## 1. Inspect the existing project first

Before changing anything:

1.  Inspect the complete existing project and its folder structure.
2.  Identify the current language, framework, database, hosting setup,
    and existing features.
3.  Preserve working functionality wherever possible.
4.  Do not replace the existing technology stack unnecessarily.
5.  Identify missing features and create a phased implementation plan.
6.  Implement features in logical phases, testing each phase.
7.  Do not leave placeholder buttons, fake data, or non-functional
    forms.
8.  If the project is empty, choose a modern, maintainable, free-first
    stack.

Preferred options when compatible with the existing project: - Frontend:
Next.js or the existing framework. - Backend: Node.js / Next.js API or
an equivalent secure backend. - Database: PostgreSQL. - ORM: Prisma or
equivalent. - Authentication: secure session-based authentication. -
Styling: Tailwind CSS. - PWA: installable Progressive Web App. -
Real-time communication: WebSockets or an equivalent. - Image
processing: Sharp and browser-side cropping. - Deployment:
free-tier-compatible hosting.

Prefer free and open-source technologies. Do not add unnecessary paid
APIs or subscriptions.

## 2. Branding and user interface

Brand: **Peshawar Cricket Club**\
Short name: **PCC**

Create a premium, professional cricket platform with: - Navy blue,
white, and gold palette. - Modern typography and consistent design
system. - Professional cricket cards, player profiles, team logos, and
tournament banners. - Responsive navigation and clean dashboards. -
Light mode and dark mode. - Smooth, restrained animations. - Responsive
layouts for desktop, laptop, tablet, Android, and iPhone.

Create an installable PWA with: - Web app manifest and app icons. -
Splash-screen behavior where supported. - Service worker. - Install-app
option. - Offline-friendly public pages and appropriate caching.

Do not present server-dependent features as functional offline.

## 3. Registration and authentication

Create a complete registration and login system. Do not require Google
or Facebook login.

Registration fields: - Full name. - Email address. - Optional phone
number. - Password. - Profile picture.

Implement: - Email verification. - Secure password hashing. - Secure
sessions and logout. - Password reset. - Login history where
appropriate. - Account status. - Role-based access control.

Roles: 1. Super Admin. 2. Team Captain. 3. Vice Captain. 4. Player. 5.
Tournament Organizer.

The Super Admin has complete administrative access.

## 4. Player profiles and image handling

Each player profile should support: - Permanent internal UUID. -
Globally unique public Player ID. - Full name and profile photograph. -
Cricket role. - Batting style. - Optional bowling style. - Optional
jersey number. - Team name and captain/vice-captain status. -
Registration date and account status.

Cricket roles: - Batsman. - Bowler. - All-Rounder. - Wicketkeeper. -
Wicketkeeper-Batsman.

Image upload requirements: 1. Accept JPG, JPEG, PNG, and WebP. 2.
Validate actual file type, dimensions, and size. 3. Compress large
images automatically. 4. Resize to suitable dimensions. 5. Convert to
optimized WebP where appropriate. 6. Generate thumbnails. 7. Provide
crop, zoom, reposition, and preview controls. 8. Support circular
profile cropping and square team-logo cropping. 9. Allow replacing an
image. 10. Prevent corrupted, incomplete, or unsafe uploads. 11. Store
image paths and metadata in the database, not image binaries. 12. Use
safe filenames and secure storage paths.

Process and validate images before updating permanent database
references.

## 5. Team creation and admin approval

After the captain completes their profile, show a **Create Your Team**
workflow.

Required fields: - Team name. - Team logo. - Team description. - Team
location. - Captain information. - Contact information.

Provide image cropping and compression for team logos.

Every new team application must initially have **Pending Admin
Approval** status.

Approval workflow: 1. Captain submits the team application. 2. Save the
complete application. 3. Notify the admin in-app. 4. Display the
application in the Admin Dashboard. 5. Admin reviews all submitted
details. 6. Admin can approve or reject and provide a rejection reason.
7. Notify the captain of the decision. 8. Approved teams become publicly
visible. 9. Rejected applications can be corrected and resubmitted.

After approval, create the official team profile and a unique team
identifier. Do not publish pending or rejected teams.

## 6. Team player management

Each team must have: - Minimum: **8 players**. - Maximum: **12
players**.

The captain selects a roster size between 8 and 12 and completes the
corresponding player forms.

Each player has: - Name. - Profile picture. - Cricket role. - Batting
style. - Optional bowling style. - Unique Player ID.

### Global Player ID sequence

Generate globally unique sequential public player numbers, displayed as:

`0001`, `0002`, `0003`, `0004` ...

Requirements: - Generate IDs on the server. - Never create duplicate
IDs. - Use an atomic database sequence or transaction. - Preserve IDs
when players are removed. - Never reuse old IDs. - Store an internal
UUID separately from the public ID.

## 7. Player login and account security

Allow players to sign in using their unique Player ID.

The captain may initiate player account access, but do not use one
shared password for the entire team. For security: - Give each player an
individual password. - Use a secure initial credential setup or
invitation flow. - Require the player to establish their own password. -
Never store passwords in plain text. - Allow secure password reset. -
Allow authorized captains to deactivate a player account. - Never expose
another team's private credentials.

Players must only access authorized areas.

## 8. Captain dashboard

Create a professional Captain Dashboard allowing the captain to: - View
their team's details and roster. - Add players within the 8--12 limit. -
Edit player information and photographs. - Change player roles. - Remove
or deactivate players. - View player IDs. - Assign, replace, or remove
the vice captain. - View team statistics. - View upcoming and previous
matches. - Apply for tournaments. - Contact other captains. - Create
match polls. - Receive notifications.

A captain can manage **only their own team**. Enforce this on the
backend, not just in the UI. Captains must not edit other teams'
players, logos, captains, or records, or access another team's private
dashboard.

## 9. Captain and vice-captain rules

Every approved team must have: - Exactly one Captain. - No more than one
Vice Captain.

The captain can assign, replace, or remove the vice captain. The vice
captain may receive configurable delegated permissions. Only the captain
or an authorized admin can transfer captain ownership.

Clearly display these positions on public team profiles.

## 10. Public teams directory

Create an official Teams page showing approved teams.

Team cards should include: - Team logo and name. - Captain and
vice-captain names. - Player count. - Team location. - View Team link.

Each team profile should display: - Team logo, name, and description. -
Captain and vice-captain details. - Public player photographs, names,
IDs, and cricket roles. - Batting and bowling styles where the player
has chosen to make them public. - Team statistics, match history, and
tournament participation.

Add search and filters.

Never expose passwords, private phone numbers, email addresses, or
private account information.

## 11. Tournament creation and approval

Allow authorized users to submit tournament applications.

Fields: - Tournament name. - Tournament logo and banner. -
Description. - Organizer name. - Start and end dates. - Venue and
city. - Minimum and maximum teams. - Registration opening date and
deadline. - Tournament format. - Entry fee. - Winning prize and optional
runner-up prize. - Rules. - Contact information. - Optional sponsor
information and special conditions.

Formats: - Knockout. - League. - Round Robin. - Group Stage. - Custom
Format.

Support free and paid registration options. Paid tournaments should
initially support manual payment instructions and admin/organizer
verification. Do not claim automatic payment verification without a real
payment integration.

Every tournament application must be reviewed by the admin. Only
approved tournaments can become public and accept official
registrations.

## 12. Tournament registration

Tournament detail pages must show: - Banner and logo. - Name and
description. - Venue and dates. - Registration deadline. - Minimum and
maximum teams. - Entry fee and prize details. - Rules. - Registered
teams and available slots.

Eligible captains can submit an approved team for entry.

Workflow: 1. Captain selects their approved team. 2. Captain submits an
entry request. 3. Organizer receives a notification. 4. Organizer
approves or rejects. 5. Approved teams appear in the participant list.

Enforce team limits and prevent duplicate registrations.

## 13. Tournament fixtures and results

Create tournament management tools for: - Teams and groups. - Fixtures
and match dates. - Venues and match status. - Match results. - Points
tables and standings. - Knockout brackets. - Semi-finals and final. -
Champion information.

Authorized organizers manage their own tournaments. Admin can supervise
all tournaments. Prevent unauthorized result editing and preserve match
history.

## 14. Match scheduling

Create a dedicated Matches section for friendly matches between teams.

Support: - Sundays and weekdays. - Custom dates. - Morning, afternoon,
and evening. - Proposed dates, times, and alternative options.

Sunday matches may offer an **After Fajr / Morning** preference, but
prayer times vary by date and location. Let organizers set the actual
time; do not hardcode prayer times.

Match details: - Home team. - Opponent team. - Proposed date and time. -
Venue. - Match format. - Description.

Create an invitation workflow. The opposing captain can accept or
reject. After acceptance, allow both captains to finalize arrangements.

## 15. Captain-to-captain chat

Build real-time messaging.

Permissions: 1. Captains can communicate with other captains. 2. Team
members can view conversations explicitly shared with them. 3. Players
cannot send messages by default. 4. Captains can authorize selected
players to send messages. 5. Captains can revoke permissions. 6.
Multiple players may be authorized. 7. Unauthorized players can only
read conversations they are permitted to view.

Include: - Text messages. - Timestamps. - Read status. - Conversation
history. - Unread counts. - Notifications. - Basic moderation and
report-message option.

Enforce all permissions on the server.

## 16. Match polls

Allow captains to create polls for: - Match dates. - Match times. -
Match venues.

Example:

Which day should we play? - Sunday - Friday - Saturday

Which time? - 7:00 AM - 8:00 AM - 9:00 AM

Which venue? - Ground A - Ground B - Ground C

Allow authorized team members to vote. Display live results. Prevent
duplicate votes, while allowing vote changes if the poll settings permit
them.

When a poll closes: - Display final results. - Allow captains to confirm
arrangements. - Create the final match schedule. - Notify relevant team
members.

## 17. Notifications

Create a centralized notification center.

Notify relevant users about: - Team registration, approval, and
rejection. - Player registration and team updates. - Tournament
submissions and decisions. - New tournament announcements. - Tournament
registrations and acceptance. - Match invitations and acceptance. -
Confirmed match schedules. - Chat messages. - New polls and results. -
Match reminders and completion. - Tournament results.

Channels: 1. In-app notifications. 2. Browser push notifications where
supported. 3. Email notifications where configured.

Include notification bell, unread count, history, mark-as-read,
mark-all-as-read, and notification preferences.

Do not claim a notification was delivered unless the delivery service
confirms it.

## 18. Super Admin Dashboard

Build a complete Super Admin Dashboard.

Dashboard statistics: - Total users. - Total and pending/approved
teams. - Total players. - Pending and approved tournaments. - Total,
upcoming, and completed matches. - Tournament registrations.

### User management

-   View and search users.
-   Edit permitted account details.
-   Suspend and reactivate accounts.
-   Trigger secure account recovery.

### Team management

-   View all teams.
-   Approve or reject applications.
-   Edit or suspend teams.
-   View team players.

### Tournament management

-   Review, approve, reject, and edit tournaments.
-   Manage banners and visibility.

### Match management

-   View matches.
-   Monitor arrangements.
-   Moderate disputes.
-   Correct records with audit logging.

### Notifications

-   Send announcements.
-   Send targeted notifications.
-   Notify all eligible registered users.

### Website management

-   Manage homepage banners.
-   Manage tournament promotions.
-   Feature teams.
-   Manage announcements and public pages.

## 19. Homepage and promotions

Create a premium homepage with: 1. Hero section. 2. Latest
announcements. 3. Featured tournaments. 4. Upcoming tournaments. 5.
Featured teams. 6. Latest matches. 7. Upcoming matches. 8. Cricket
statistics. 9. Join PCC section. 10. Contact information and footer.

Create an admin-controlled banner system.

Admin can upload, crop, and compress banners; set title, description,
display dates, destination link, and visibility; and feature important
tournaments.

When a tournament is approved, notify eligible registered users. If
admin enables automatic announcements, publish the announcement and
notify users.

## 20. Google AdSense readiness

Prepare the platform for Google AdSense: - Responsive advertisement
placements. - Homepage and suitable public content-page placements. -
Admin configuration for publisher ID and ad slot IDs. - Keep ad
placements disabled until configured. - Load the official AdSense script
only when configured. - Do not place ads on login forms or sensitive
account pages. - Avoid intrusive ads. - Follow AdSense policies. -
Create Privacy Policy, Terms and Conditions, About Us, and Contact Us
pages. - Include appropriate cookie/privacy information.

Never invent publisher IDs or bypass approval. Leave clearly named
settings ready for my credentials.

## 21. Google Search Console and SEO

SEO is a top priority.

Implement: - Unique page titles and meta descriptions. - Canonical
URLs. - XML sitemap. - Robots.txt. - Open Graph and social metadata. -
Structured data where accurate. - Breadcrumbs and internal links. -
Image alt text. - SEO-friendly URLs. - Mobile-first indexing
readiness. - Fast page loading and Core Web Vitals improvements.

Use appropriate structured data for the organization, sports events,
breadcrumbs, and website. Never add misleading structured data or fake
reviews.

Public routes should include: - `/` - `/teams` - `/teams/[team-slug]` -
`/players/[player-id]` - `/tournaments` -
`/tournaments/[tournament-slug]` - `/matches` - `/matches/[match-id]` -
`/about` - `/contact` - `/privacy-policy` - `/terms-and-conditions`

Generate dynamic metadata for approved public content. Keep private
dashboards and sensitive information out of search indexing.

Provide Google Search Console verification configuration so I can add my
verification code or HTML file.

Create an SEO settings page in Admin Dashboard.

## 22. Database design

Create a normalized, maintainable database with suitable entities/tables
for: - users - user_roles - user_sessions - teams - team_members -
players - player_sequences - tournaments - tournament_applications -
tournament_teams - tournament_groups - tournament_fixtures - matches -
match_invitations - match_polls - poll_options - poll_votes -
conversations - conversation_members - messages -
notification_preferences - notifications - media_assets - banners -
announcements - audit_logs - admin_settings

Use foreign keys, unique constraints, indexes, transactions, timestamps,
soft deletion where appropriate, and suitable status fields.

Player ID generation must be atomic and globally unique.

Create database migrations. Use seed data only for development. Never
insert fake production users or teams.

## 23. Security

Security is mandatory.

Implement: - Secure password hashing. - CSRF protection where
applicable. - XSS protection. - SQL injection prevention. - Rate
limiting. - Input validation. - File upload validation. - Secure session
handling. - Server-side authorization. - Role-based access control. -
Secure environment variables. - Audit logging. - Backup and recovery
guidance. - Protection against unauthorized team access.

Never expose database credentials, API secrets, private player data,
password hashes, or session tokens.

Never hardcode secrets into frontend code or public repositories.

Create a secure initial admin setup process. Do not create a publicly
known default admin password.

## 24. Performance

Optimize for ordinary Android phones and slower internet connections.

Implement: - Lazy loading. - Responsive image sizes. - WebP images and
thumbnails. - Image compression. - Database query optimization. -
Pagination. - Caching. - Code splitting. - Efficient API requests. -
Optimized frontend assets.

## 25. Free-first policy

Keep the platform free of cost as much as practically possible.

Prioritize open-source libraries, free-tier hosting and databases, free
image processing, free authentication options, free development tools,
free SEO tools, and PWA functionality.

Avoid paid templates, plugins, themes, APIs, and subscriptions unless
absolutely necessary.

Do not assume free tiers are unlimited. Document quotas, storage limits,
usage limits, and possible future costs.

Provide a free-first deployment guide.

If a service requires credentials, implement the integration and provide
a clearly named configuration field. Never invent credentials.

## 26. Automation

Automate internal workflows: - Generate player IDs. - Generate team and
tournament slugs. - Compress images and generate thumbnails. - Update
team player counts. - Update tournament registration counts. - Generate
notifications. - Update match status when appropriate. - Publish
approved content. - Generate SEO metadata. - Update sitemap entries. -
Update homepage featured sections.

Use reliable background jobs where necessary. Prevent duplicate
notifications and duplicate operations. Include retries and error
logging.

## 27. Testing and quality assurance

Test: - Registration, login, logout, and password reset. - Team creation
and approval. - Player creation and ID generation. - Minimum 8 and
maximum 12 player rules. - Captain permissions and vice-captain
assignment. - Player editing and team isolation. - Tournament creation
and approval. - Tournament registration and team limits. - Match
invitations. - Captain chat and player messaging permissions. - Poll
voting. - Notification generation. - Image cropping and compression. -
Admin access. - SEO routes. - Mobile responsiveness.

Test successful and unsuccessful scenarios. Fix critical bugs. Never
mark an unfinished feature as complete.

## 28. Development execution rules

Work autonomously within the permissions and tools already available in
the development environment.

-   Do not repeatedly ask me to approve ordinary coding tasks.
-   Do not stop after creating a plan.
-   Do not merely tell me which files to edit.
-   Actually create and modify the required files.
-   Install dependencies where appropriate.
-   Run migrations, builds, and tests.
-   Fix errors and inspect the final implementation.
-   Use sensible defaults where details are missing.

However: - Never bypass security restrictions. - Never expose secrets. -
Never spend money or subscribe to paid services. - Never publish or
deploy publicly without required account authorization. - Never make
destructive production or database changes without appropriate
authorization. - Never pretend an external integration is connected when
credentials are missing.

When credentials are required, leave the integration configured as far
as possible and provide one consolidated setup checklist rather than
repeatedly interrupting development.

## 29. Final delivery requirements

Deliver: 1. Functional public website. 2. Responsive mobile experience.
3. Installable PWA. 4. Registration and login. 5. Player profiles. 6.
Team registration and approval. 7. Player management and unique IDs. 8.
Captain dashboard. 9. Vice-captain functionality. 10. Public teams
directory. 11. Tournament creation and approval. 12. Tournament
registration. 13. Tournament fixtures and results. 14. Match scheduling.
15. Captain-to-captain chat. 16. Authorized player messaging. 17. Match
polls. 18. Notifications. 19. Complete admin dashboard. 20. Banner
management. 21. AdSense-ready placements. 22. Search Console readiness.
23. SEO implementation. 24. Secure database. 25. Image compression and
cropping. 26. Documentation and free-first deployment guide.

## 30. Final report

When implementation is finished, provide:

A. Complete project folder structure.\
B. Technologies used.\
C. Database schema and migration instructions.\
D. Required environment variables.\
E. Secure admin initialization instructions.\
F. Local development instructions.\
G. Production deployment instructions.\
H. Google AdSense setup instructions.\
I. Google Search Console setup instructions.\
J. Security and backup instructions.\
K. Features successfully implemented and tested.\
L. Features requiring external credentials or services.\
M. Remaining bugs, limitations, or unfinished work.

**Final instruction:** Do not deliver a static prototype. Deliver a
secure, functional, maintainable Peshawar Cricket Club platform. Work
systematically, implement real backend functionality, verify every
module, and prioritize reliability, security, SEO, mobile performance,
and a premium user experience.

The project is not complete until implemented features have been tested
and the final production build succeeds.


# AUTONOMOUS END-TO-END DEVELOPMENT, RECOVERY & FREE VERCEL DEPLOYMENT INSTRUCTIONS

## 31. Complete Autonomous Execution — Mandatory

You are now responsible for completing the entire Peshawar Cricket Club (PCC) project from the current development state to a fully working, tested, deployed website.

Your responsibility does not end after writing code, creating a plan, or completing the frontend.

You must continue until every technically possible task has been completed and verified.

### 31.1 Autonomous Working Mode

Work as an autonomous senior software development agent.

You must:

1. Inspect the entire existing workspace.
2. Read the complete `PCC_MASTER_DEVELOPMENT_PROMPT.md`.
3. Read all existing source files, configurations, database schemas, and documentation.
4. Understand the existing project before making changes.
5. Complete all unfinished functionality.
6. Fix existing errors and broken features.
7. Create missing files and folders.
8. Install required dependencies.
9. Configure the database and backend.
10. Implement all required integrations.
11. Run tests and production builds.
12. Resolve errors independently.
13. Prepare and deploy the complete application.
14. Verify the deployed website.
15. Provide a complete final report.

**Do not stop after planning. Do not deliver an incomplete prototype. Do not leave unfinished modules simply because the implementation takes multiple steps.**

### 31.2 Do Not Repeatedly Ask for Permission

Use the available VS Code, GitHub, terminal, browser, and development tools autonomously.

Do not repeatedly ask me questions such as:

- Should I create this file?
- Should I install this dependency?
- Should I fix this error?
- Should I configure this route?
- Should I run the tests?
- Should I continue to the next development phase?

These are ordinary development responsibilities. Complete them independently.

Use sensible defaults whenever requirements are already defined in this master specification.

Do not interrupt the workflow for decisions that can safely be made by inspecting the existing codebase.

Use available authorized permissions and pre-approved execution capabilities wherever possible.

If an essential action requires a genuine external authorization, explain the exact requirement and continue all other independent work.

Never bypass security restrictions, browser security, OAuth consent, account verification, or mandatory approval screens. Never claim an action was authorized when it was not.

### 31.3 Existing Google Account and Chrome Browser

Google Chrome is already open on my computer.

Use the Google account I provide through the existing browser session where supported.

Your responsibilities include:

1. Inspect whether I am already authenticated with Google.
2. Use the existing authorized browser session where possible.
3. Access the official Vercel website.
4. Use Google authentication for Vercel registration when available.
5. Connect the appropriate GitHub account and repository.
6. Configure the Vercel project.
7. Configure the required deployment settings.
8. Configure environment variables securely.
9. Configure the database connection.
10. Verify deployment status.

Do not ask me to enter my Google password into project files, source code, terminal commands, or chat.

Never read, export, copy, or expose browser cookies, authentication tokens, saved passwords, or private session data.

If Google requires an explicit OAuth consent, CAPTCHA, email verification, security challenge, or other account-owner action, stop only at that mandatory step and clearly identify what I need to do.

Continue all other available work without waiting unnecessarily.

### 31.4 Free Vercel Hosting — Mandatory Deployment Target

My requirement is completely free hosting.

Use:

**Vercel Free / Hobby Plan**

Official website:

https://vercel.com/

Deployment requirements:

1. Create a new Vercel project using the authorized account.
2. Connect the existing PCC GitHub repository.
3. Configure the correct production branch.
4. Configure build commands.
5. Configure the correct output directory.
6. Configure environment variables.
7. Configure database connectivity.
8. Configure production routing.
9. Configure custom domain support where available.
10. Deploy the application.
11. Inspect build logs.
12. Fix all deployment errors.
13. Verify the production website.
14. Verify important public routes.
15. Verify authentication and dashboard access.
16. Verify database operations.

Do not purchase any hosting package.

Do not activate any paid subscription.

Do not add a payment method.

Do not exceed free-tier service limits intentionally.

Check the actual compatibility of the existing technology stack before selecting a deployment architecture.

If the existing project uses PHP, conventional MySQL, or another technology that cannot run directly on Vercel, implement a suitable migration to a compatible architecture.

Preferred free-first architecture, where appropriate:

- Frontend: Next.js.
- Backend: Next.js server-side functionality or compatible APIs.
- Database: PostgreSQL.
- Database provider: a suitable free-tier PostgreSQL service such as Neon or Supabase.
- ORM: Prisma.
- Styling: Tailwind CSS.
- Authentication: secure session-based authentication.
- Deployment: Vercel Hobby.
- Image processing: Sharp or equivalent compatible technology.

These are preferences, not permission to discard existing working functionality.

Check current provider availability, free-tier quotas, regional restrictions, and compatibility before selecting services.

If one free provider is unsuitable, evaluate another free alternative.

Never silently introduce a paid dependency.

### 31.5 Old Hosting Deleted — Project Recovery and Migration

IMPORTANT:

My previous hosting account and hosting environment have been deleted.

Do not assume the old production server or its database is still accessible.

First inspect:

- Existing local project files.
- GitHub repository.
- Git history and previous commits.
- Existing SQL exports.
- Database backups.
- Existing configuration files.
- Existing uploads and media.
- Existing admin authentication implementation.
- Existing environment configuration.

Search the available project and authorized storage locations for recoverable data.

Recover and preserve, wherever available:

1. Existing admin account.
2. Existing admin permissions.
3. Existing admin password hash.
4. User records.
5. Player records.
6. Team records.
7. Tournament records.
8. Match records.
9. Uploaded player photographs.
10. Team logos.
11. Tournament banners.
12. Existing announcements.
13. Existing settings.
14. All other important application data.

Do not assume that deleting the hosting service means that all GitHub files or local backups are also deleted.

If the old database backup exists:

- Inspect its schema.
- Validate its contents.
- Create the new database.
- Import the data.
- Preserve relationships and IDs.
- Validate record counts.
- Check foreign keys.
- Check encoding.
- Verify migrated records.

If no database backup exists, inspect available Git history and project files and recover whatever can legitimately be reconstructed.

Never invent missing users, passwords, player records, or historical match results.

### 31.6 Existing Admin Account Preservation

The existing Super Admin account is extremely important.

Preserve the existing administrator account and its administrative privileges.

If the existing password hash is available and compatible with the new authentication implementation, preserve it.

If password migration is technically impossible:

1. Create a secure admin recovery procedure.
2. Use a one-time setup token or secure password reset.
3. Verify administrator ownership.
4. Set a new secure password.
5. Remove the temporary recovery mechanism after successful setup.

Never expose or print password hashes, plain-text passwords, or authentication tokens.

Never create a publicly accessible default admin password.

Never lock me out of the Super Admin Dashboard during migration.

### 31.7 Complete Database Setup

Create and configure the production database.

Requirements:

- Create all required tables.
- Apply database migrations.
- Configure foreign keys.
- Configure indexes.
- Preserve unique identifiers.
- Preserve existing records.
- Configure database connection pooling where supported.
- Configure secure environment variables.
- Test database read/write operations.
- Test authentication against the production database.
- Verify all admin operations.
- Verify team and player management.
- Verify tournament management.
- Verify match management.

Use the correct production database connection.

Do not use development seed data in production.

Do not overwrite recovered production data with empty seed data.

### 31.8 Complete GitHub Integration

Use the existing authorized GitHub account and repository.

Repository:

https://github.com/muhammadsajidburki/pcc

First verify the actual repository URL in the existing project configuration. If the repository differs, use the existing PCC repository rather than assuming the example URL is correct.

Requirements:

1. Inspect the current Git branch.
2. Inspect existing commits.
3. Preserve existing project history.
4. Resolve synchronization problems safely.
5. Add the necessary updated files.
6. Ensure `.env` and secrets are excluded.
7. Create or update `.gitignore`.
8. Commit completed changes.
9. Push to the authorized repository.
10. Connect the repository to Vercel.
11. Configure automatic deployment for future authorized GitHub pushes.

Never force-push or delete existing Git history merely to make a deployment work.

### 31.9 Production Security

Before deployment, verify:

- Secure authentication.
- Password hashing.
- Admin authorization.
- Role-based access control.
- CSRF protection where applicable.
- SQL injection prevention.
- XSS protection.
- Rate limiting.
- Secure file uploads.
- Secure environment variables.
- Database permissions.
- Production error handling.
- Private dashboard protection.
- Session security.

Ensure that no sensitive information is exposed through public GitHub commits, browser source code, logs, or API responses.

### 31.10 Complete Application Testing

Test the complete PCC application, including:

- Homepage.
- Registration.
- Login and logout.
- Password recovery.
- Super Admin Dashboard.
- Captain Dashboard.
- Player Dashboard.
- Team creation.
- Team approval.
- Player management.
- Global Player ID generation.
- Vice-captain assignment.
- Public team directory.
- Tournament applications.
- Tournament approval.
- Tournament registrations.
- Fixtures.
- Results.
- Match invitations.
- Captain messaging.
- Player messaging permissions.
- Match polls.
- Notifications.
- Image uploads.
- Image cropping.
- Responsive layouts.
- PWA installation.
- SEO metadata.
- Sitemap.
- Robots.txt.

Test both successful and unsuccessful scenarios.

Fix all critical errors before considering the project complete.

### 31.11 Production Deployment Verification

A successful deployment message alone is not sufficient.

After deployment:

1. Open the actual production URL.
2. Verify that the homepage loads.
3. Verify public navigation.
4. Verify database connectivity.
5. Test registration and login.
6. Test the existing Super Admin account.
7. Verify dashboard permissions.
8. Test important create, update, and delete operations.
9. Test image loading.
10. Check mobile responsiveness.
11. Inspect server and deployment logs.
12. Fix any production errors.

Do not claim that a feature works unless it has actually been tested.

### 31.12 Backup and Recovery

Before database migration, create a backup of all recoverable existing data.

After migration, create a new backup.

Document:

- Database backup location.
- Database restoration instructions.
- Environment variable requirements.
- Deployment rollback procedure.
- Admin recovery procedure.
- GitHub recovery procedure.

Do not delete original project files or backups until the new deployment and database have been verified.

### 31.13 No Paid Services

My budget is zero.

Use free services only.

Do not:

- Buy a domain.
- Purchase hosting.
- Activate a paid database plan.
- Purchase an API subscription.
- Purchase an email service.
- Enable paid features.
- Agree to paid upgrades.
- Enter payment details.

If a feature cannot be implemented using available free services, provide a working free alternative or clearly document the limitation.

### 31.14 Handling Mandatory External Permissions

Minimize interruptions.

Do not request repeated permission for ordinary development operations if the environment already authorizes them.

However, stop when an action genuinely requires:

- Google account-owner consent.
- OAuth authorization.
- CAPTCHA or identity verification.
- A mandatory security confirmation.
- A new account-owner credential.
- A paid-service decision.
- An irreversible destructive operation.
- An action that would expose private information.

Group unavoidable requests together whenever possible.

Continue all work that does not depend on the missing authorization.

Never bypass security prompts or falsely report that an authorization has been granted.

### 31.15 Final Completion Conditions

The project is complete only when:

1. All required PCC modules are implemented.
2. Frontend and backend are functional.
3. Database is configured and verified.
4. Existing recoverable data is migrated.
5. Existing Super Admin access is preserved or securely recovered.
6. Security checks are completed.
7. Production build succeeds.
8. Tests are completed.
9. GitHub integration is configured.
10. Vercel deployment succeeds.
11. Production website is accessible.
12. Critical application workflows are verified.

If any condition cannot be fulfilled because of missing credentials, unavailable backups, external restrictions, or free-tier limitations, document the exact reason. Do not falsely mark it complete.

### 31.16 Final Delivery Report

At the end, provide:

A. Actual production website URL.

B. Vercel project status.

C. GitHub repository status.

D. Database provider and connection status, without revealing credentials.

E. Database migration and backup status.

F. Existing admin account recovery status.

G. Features successfully implemented.

H. Features successfully tested.

I. Mobile and PWA verification.

J. SEO and Search Console readiness.

K. Free hosting and database limitations.

L. External authorization or credentials still required.

M. Remaining bugs or unfinished work.

N. Exact steps, if any, that require my direct intervention.

**FINAL NON-NEGOTIABLE INSTRUCTION**

Work autonomously from the existing PCC project to the final production deployment.

Do not stop after planning, coding, or local testing.

Do not repeatedly ask me to approve routine development activities.

Use my existing authorized Google and GitHub sessions where possible.

Use free Vercel-compatible hosting and free database services.

Recover and preserve all existing data that is actually available.

Preserve or securely recover Super Admin access.

Implement, build, test, deploy, inspect, and fix.

Your objective is a complete, secure, fully functional Peshawar Cricket Club platform—not a demo, not a partial website, and not an unfinished development report.