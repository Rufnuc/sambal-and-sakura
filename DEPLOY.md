# Deploying Sambal & Sakura to Render

**Cost: £0 while you build and demo; about $13 (~£10) a month from go-live.**
- **Now (free):** Render free web service + Neon Free database. Fine for building and showing the owners. The site sleeps after ~15 minutes without visitors (the next visit takes 30-60 seconds to wake), so open it a minute before a demo.
- **Go-live (paid, never cuts off):** Render Starter web service ($7/mo) + Render Postgres basic-256mb ($6/mo): always on, same bill every month, continuous backups. See **"Going live"** at the end. Don't take real orders on the free setup: the free web service sleeps, and Neon Free stops for the rest of the month if its 100 compute-hours run out.

Check Render's and Neon's pricing pages before quoting a client; prices change.

How it works: local development uses SQLite. Production uses PostgreSQL. `scripts/prepare-postgres.mjs` derives the Postgres schema from the single dev schema at build time, so the two can never drift apart.

## 1. Before you start (accounts)

| What | Why | Required? |
|---|---|---|
| GitHub account | Render deploys from a Git repo | Yes |
| Render account | Hosting | Yes |
| Neon account (free) | Database | Yes (or use Render Postgres) |
| Cloudinary account (free) | Menu photo uploads. Render's disk is wiped on every deploy, so uploads are refused without it | Yes, if the restaurant wants photos |
| Google Translate key | Full-site translation | Optional |
| Groq key | "Ask about this dish" assistant | Optional |
| Sunmi developer / cloud-printing access | Auto-print kitchen tickets on your Sunmi printer (see below) | Optional |
| PrintNode | Alternative to Sunmi for other printers | Optional |
| WeChat Pay merchant keys | Chinese-language payments | Optional |

## 2. Put the code on GitHub

The project folder is not a Git repository yet. From the project folder:

```bash
git init
git add .
git status        # CHECK: .env must NOT be listed. .env.example SHOULD be.
git commit -m "Initial commit"
```

Then create an **empty private** repo on GitHub and push to it (GitHub shows the exact commands).

> Never commit `.env`. It holds your Google, Groq and WeChat keys. `.gitignore` already excludes it.

## 3. Create the database (free, for now)

**Neon Free:** create a project in the **EU (Frankfurt or London)** region. Copy two connection strings:
- the **pooled** one (its host contains `-pooler`): add `&pgbouncer=true&connection_limit=5` to the end and use it as `DATABASE_URL`
- the **direct** one: use it as `DIRECT_DATABASE_URL` (only migrations use it)

Neon Free gives 100 compute-hours a month and pauses the database after 5 idle minutes (it wakes in under a second). The site is built to let it sleep: the health check doesn't touch the database, and the every-minute order checks only run for 3 hours after order activity. Free restore history is only 6 hours, so it's for building and demos, not live trading.

Don't use Render's *free* Postgres: it expires.

## 4. Create the Render service

1. Render dashboard → **New → Blueprint** → pick your GitHub repo. It reads `render.yaml`.
2. Fill in the secrets Render asks for (`sync: false` values):
   - `DATABASE_URL` and `DIRECT_DATABASE_URL`: the strings from step 3
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters): your owner login. **Delete `ADMIN_PASSWORD` from Render after the first deploy** (it's only used once)
   - Any optional keys you have (Cloudinary, Google, Groq, PrintNode, WeChat)
3. Click **Apply**. The first deploy takes a few minutes.

On every deploy Render will: install, derive the Postgres schema, generate the client, **apply database migrations**, **create the owner account if none exists** (it never overwrites an existing one), build the site, and check `/api/health` before switching traffic. (`/api/health` doesn't touch the database; `/api/health?db=1` does, if you want to check it yourself.)

## 5. After the first deploy

1. Open `https://YOUR-SERVICE.onrender.com/staff/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Change the password** in Admin → Settings.
3. Admin → Settings → **Connection check**: run it on your phone using mobile data, then on Wi-Fi. The "Detected address" must change between the two. If it shows the same address both times (Render's own), set `CLIENT_IP_HEADER` to whichever header shows your real address. Rate limits depend on this.
4. Check the Admin → Menu, Careers and Promotions pages. Edits appear on the public site immediately.
5. Open **Admin → Site content** and fill in the real phone, email, address, opening hours and social links (these are placeholders until you do). Opening hours also control which times customers can book.
6. **Reviews start switched off and empty.** Only add genuine reviews from real customers who agreed to be quoted; the site refuses to show the old demo ones.
7. Set up the **Security switches** below (bot check + alerts) before you advertise the site.

### Customer emails (Brevo)
Order updates (received, on its way / ready, completed, cancelled), booking confirmations and day-before reminders, account emails, and the offer emails you write in Admin → Promotions all go by email. Customers must give an email to order or book.

1. Create a free account at brevo.com (300 emails a day; enough for about 100 orders a day).
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain**: add the restaurant's domain and create the DNS records Brevo shows (DKIM, and DMARC if asked) at your domain registrar. Without this, emails land in spam or are refused.
3. **SMTP & API → API keys → Generate**. Set in Render: `BREVO_API_KEY`, `EMAIL_FROM` (e.g. `orders@sambalandsakura.co.uk`), and leave `EMAIL_FROM_NAME`.
4. Admin → Promotions → **Email customers → Send me a test** to check it arrives.

How sending is protected: each order/booking email is sent once only; if Brevo fails you get an owner alert. Offer emails only go to customers who ticked "Email me offers" (the law requires a clear yes), always include an unsubscribe link, and only use the day's spare allowance (40% is kept for order emails), finishing the next day if needed. If you move to a paid Brevo plan, set `EMAIL_DAILY_LIMIT` to the new daily allowance.

**Keep `SESSION_SECRET` the same forever** once live: it signs unsubscribe links and blocks closed accounts' emails.

### Order tracking and cancellations
- Every "order received" email has a **Track your order** link (also on the confirmation screen): a live page showing Order received → Being cooked → Ready for pickup / On the way → Completed. The link is private to that order and never shows the address or phone number.
- Customers can **cancel from that page for 5 minutes** after ordering (orders for later: until shortly before their time). The kitchen gets a printed **CANCELLED - STOP PREPARING** ticket, the Orders screen shows a red alarm (with sound if it's switched on), the owner gets a phone alert, and the customer gets an email.
- Cancellations by the customer and orders marked **"Not collected"** count against them (tracked by phone, email and account). At 2 in 60 days their tickets say "call to confirm"; at 3 they can't cancel online or order cash delivery. Change all of this in **Admin → Settings → Cancellations**; reset a customer from the order's details.
- When staff cancel, they choose why. Only "customer asked" and "not collected" count.

### Home page banner and signature dishes
- **Admin → Site content → Home page → Banner images**: pick the dish for each of the three stacked plates. Each shows that dish's photo from Admin → Menu, or upload a photo just for the banner. Choose which dish's name goes on the small "Signature" card (or none). The plates show beside the headline on tablets and larger screens; phones show the headline alone (there isn't room beside it).
- **Signature dishes**: leave on Automatic (chef's specials and popular dishes) or choose up to 6 in your own order.
- Press **Save changes**; the home page updates straight away.

### Offer codes
- **Admin → Promotions → Offers & vouchers**: give an offer a code (letters, numbers, dashes) and choose what it gives - **% off**, **£ off** or **a free dish** - plus an optional minimum food spend, **First order only** (one first-order offer per customer) or **Once per customer** (by phone number). Checkout applies exactly that, and the Offers page shows it under the code (e.g. "15% off · food £20+ · once per customer").
- **Hidden from Offers page**: the code still works at checkout but isn't advertised - for flyers, emails or staff to hand out. **WELCOME10** is set up this way: 10% off a first-time customer's first order (food £12+); change or remove it like any other offer.
- Remove an offer, or its code, and the code stops working straight away. Codes only work while Offers is switched on under Campaigns.
- The site refuses settings that wouldn't work: a code with nothing (or two things) to give, two offers with the same code, £ off bigger than the minimum spend, or a dish that isn't on the menu.

### Switching campaigns off (Offers, Fortune Wheel, Refer a friend)
- **Admin → Promotions → Campaigns** has an on/off switch for each. Switched off, its tab on the Offers page shows your message instead (default: "Sorry, this campaign has ended for now. Keep checking back - exciting offers are on the way!"), and it really stops: offer codes such as SAKURA10 and the automatic free gyoza stop at checkout, nobody can spin, and new referral codes are ignored.
- **Rewards customers already have** (wheel prizes, referral rewards) keep working for the number of days you choose (default 14, up to 90; 0 = stop at once), never past their own expiry. Their "use by" date in the customer's account updates to match. A referral that was waiting for the friend's first order still pays out inside that period.
- Switching back on restores everything; nothing is deleted. Every change is in the activity log.

### Refer a friend
- Every customer has a permanent code and a link (Offers → Refer a friend). A friend who opens the link sees "a friend gave you £5 off" and signs up; the code is filled in for them (or they can type it).
- The friend gets **£5 off their first order** (food £20+, first-order offer, so not on top of the welcome 10%). The referrer gets **£5 off** only when that friend's first order of £20+ is **completed**, and gets an email. Both rewards expire after 90 days.
- Refused or voided automatically: the referrer's own phone number, a phone that has ordered or been referred before, a delivery to the referrer's address, more than "Max per customer" referrals, more than 5 sign-ups on one code in a day.
- **Admin → Promotions → Referral programme**: change the amounts (on/off is under Campaigns) (pounds and pence; the minimum spend must be at least the friend's reward), minimum spend and limit - a preview shows what customers will see, and after Save it changes everywhere at once (Offers page, friend banner, sign-up form, share message, new rewards, reward email, the Contact page facts and llms.txt; rewards already issued keep their amount), see every referral, and **Void** one that looks wrong (any unused rewards from it stop working). Voids are in the activity log.

### Customer accounts
- **Deactivate**: the customer is signed out and can reactivate within 14 days by signing in (points and rewards come back). After 14 days the account closes automatically.
- **Close**: immediate and permanent. Personal details are removed; orders stay (without personal details) for your accounts.
- A closed account's email can never sign up again, which stops people re-creating accounts to collect sign-up rewards. The email itself isn't stored, only a fingerprint of it. For a genuine mistake, Admin → Customers → **Allow a closed account's email again**.

### Security switches
- **Bot check** (stops scripts placing fake orders, creating accounts or booking out a night): create a free Cloudflare Turnstile widget for your domain at dash.cloudflare.com → Turnstile, then set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Signed-in customers never see it; guests usually don't either (it only asks when something looks automated).
- **Owner alerts** (failed kitchen print, order not started after 5 minutes, WeChat refund needed, repeated failed staff sign-ins, translation limit reached): install the free **ntfy** app on your phone, subscribe to a long random topic name, and set `ALERT_WEBHOOK_URL=https://ntfy.sh/<that-topic>`. Keep the topic name secret.
- **Pause online orders**: Admin → Orders has an emergency button for floods of fake orders, kitchen problems or power cuts. Customers are asked to phone instead.
- **Activity log**: Admin → Settings shows who changed what (order statuses, edits, sign-ins).
- **Logs**: Render → your service → Logs. Every line is JSON; search for `print_failed`, `order_created`, `rate_limited`, `unhandled_error` or an order number.

- **Database row security (RLS)**: switched on for every table by the migrations. The website connects as the
  database owner, so it works normally; any other database login (a read-only user, a hosted "Data API") sees
  nothing. Admin → Settings → Connection check → "database row security" should say **on for every table**. Use
  one database user for both migrations and the website (Render and Neon both do this by default).

### API keys
Restrict every key to what it's for: in Google Cloud, restrict the translation key to the **Cloud Translation API** and set a daily quota (APIs & Services → Cloud Translation → Quotas) plus a billing alert. If a key is ever pasted somewhere public (chat, email, a screenshot), rotate it.

### Custom domain
Render → your service → **Settings → Custom Domains**, add `sambalandsakura.co.uk`, then create the DNS records Render shows. SSL is automatic and free. Then, in Render's environment:
- set `SITE_URL=https://www.sambalandsakura.co.uk` (the www address is the main one; the plain domain redirects to it) (the sitemap, canonical links, social previews and Google data all use it; until the domain is connected, set it to the onrender.com address instead),
- set `WECHAT_NOTIFY_URL` to use the final domain.

In Render → Settings → Custom Domains, also tick **redirect** for the onrender.com address once the domain works, so Google only sees one copy of the site.

If you put **Cloudflare** in front: turn OFF **Security → Bots → "Block AI bots"** (and "AI Crawl Control" blocking). Cloudflare enables it by default on new sites and it hides the restaurant from ChatGPT, Perplexity, Claude and Gemini regardless of `robots.txt`.

### Menu photos (Cloudinary)
Each dish can have **up to 6 photos** (Admin → Menu → edit a dish → Photos; pick several at once). The first is the main photo, shown first on the menu and used on the home banner; customers swipe through the rest (arrows on computers). Reorder with the arrows; remove with the bin.

Photos are shrunk in the browser before upload (max 1200px, WebP, typically 100-250KB instead of several MB), so they're small even without Cloudinary. With Cloudinary they're also served in the best format for each phone.

Cloudinary also stores the **pictures and PDFs for promotional emails** (Admin → Promotions → Email customers). Without it, uploads are refused on the live site (Render's disk is wiped on every deploy).

**Set it up (about 5 minutes, free plan is enough):**
1. Sign up at [cloudinary.com](https://cloudinary.com/users/register_free) (free plan: 25 credits a month, plenty for a restaurant).
2. Open **Dashboard** (or **Settings → API Keys**) and copy three values: **Cloud name**, **API key**, **API secret**.
3. In Render → your service → **Environment**, add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` with those values, then **Save, rebuild and deploy**.
4. So PDFs in promotional emails open for customers: in Cloudinary go to **Settings → Security** and turn on **"Allow delivery of PDF and ZIP files"** (it's off on new free accounts), then save.
5. Check: Admin → Menu → edit a dish → add a photo. It should upload and show. Then Admin → Promotions → Email customers → "Add a picture" / "Add a PDF" → "Send me a test".

These keys make uploads **signed** (only this server can upload). The older unsigned-preset option (`CLOUDINARY_UPLOAD_PRESET`) still works but lets anyone who learns the preset name upload to your account. Never put the API secret anywhere except Render's Environment page.

### Job applications (Careers page)
"Apply" opens a form: name, email, phone, an optional message and a CV (PDF or Word, up to 4 MB). It's emailed through Brevo to the restaurant email in Site content (or to `CAREERS_EMAIL` if you set it), with the CV attached; pressing **Reply** answers the applicant, who also gets a short "we've received it" email. Nothing is stored on the website. Needs the Brevo settings above; without them the form tells applicants to email instead. Delete CVs from the mailbox within 6 months if you don't hire the person (that's what the Privacy Policy promises).

### WeChat Pay
Set **all** of `WECHAT_APPID`, `WECHAT_MCHID`, `WECHAT_SERIAL_NO`, `WECHAT_PRIVATE_KEY`, `WECHAT_NOTIFY_URL`, `WECHAT_API_V3_KEY` and `WECHAT_PLATFORM_PUBLIC_KEY`. In the merchant console, set the payment notification URL to `https://YOUR-DOMAIN/api/pay/wechat/notify`.

The payment-confirmation code is tested (signature verification, replay protection, amount check) against simulated WeChat messages, **but it has not been run against live WeChat**. Do one real small test payment before announcing it. Until all the keys are set, WeChat is hidden from customers and cash still works.

### Sunmi kitchen printer (automatic tickets)

Your **Sunmi 80mm cloud printer** can print every new order by itself. The website sends the ticket to Sunmi's cloud
and the printer, connected to the restaurant Wi-Fi or network cable, collects it. **No computer is needed at the restaurant.**

**What gets printed:** a big "COLLECTION" or "DELIVERY" and order number, the time in UK time, the customer and address,
every item in large type with options underneath, the totals, and a very clear payment line (**CASH £x.xx** to collect, or
**PAID - WECHAT PAY / DO NOT COLLECT CASH**), plus notes. Chinese names and notes print correctly.
Cash orders print the moment they are placed; WeChat orders print only once the payment has been confirmed.

**Set up (one time):**

1. **Put the printer on the network.** Connect it with a network cable, or use Sunmi's app to put it on the restaurant Wi-Fi.
   Check it shows as online in Sunmi's app.
2. **Get access to Sunmi's cloud printing for developers.** Sunmi gives each business an **App ID** and an **App Key**. Sign up
   at developer.sunmi.com and ask for cloud printing (OpenAPI) access, or ask your Sunmi reseller to do it. This step is run by
   Sunmi and can take a little while, and nothing below works without it.
3. **Find the printer's serial number (SN)**, on the label under the printer and in Sunmi's app.
4. **Add three settings in Render** (Environment tab): `SUNMI_APP_ID`, `SUNMI_APP_KEY`, `SUNMI_PRINTER_SN`. Then let it redeploy.
5. **Press "Send test print"**: Admin -> Settings -> **Kitchen printer**. A test ticket (it includes Chinese text) should print.
   If it does not, the screen shows Sunmi's own reply so the problem is easy to read.

**If the test print fails**, run the helper on your computer to see what Sunmi says (put the three settings in `.env` first):

```bash
node --env-file=.env scripts/sunmi.mjs status
node --env-file=.env scripts/sunmi.mjs hello
```

If Sunmi says the printer is not linked to your account, ask Sunmi for your **shop id** and run
`node --env-file=.env scripts/sunmi.mjs bind <shopId>` once.

**Day to day:** in Admin -> Orders, open an order and press **Reprint to kitchen** if a ticket is missed or the paper jammed.
If the printer is off or out of paper, customers' orders still go through normally. Reprint from the admin when it is back.

**Honest note:** this connection was built from Sunmi's published cloud-printing interface as implemented in an open-source
library, and tested against a stand-in that re-checks every signature. It has not yet been run against your real printer
and Sunmi account, so treat the first test print as the real confirmation.

## 6. Getting found on Google

Google does not find a new site by itself quickly. The code already does its part (sitemap, robots file,
canonical links, the restaurant's details in a format Google reads, and both spellings "Sambal & Sakura" /
"Sambal and Sakura"). These steps are yours, because they need your Google account:

1. **`SITE_URL` must match the real address.** It is set in `render.yaml`. If you connect your own domain later,
   change `SITE_URL` in Render to it (e.g. `https://sambalandsakura.co.uk`) and let it redeploy. A wrong value
   makes Google ignore the sitemap.
2. **Google Search Console** (search.google.com/search-console):
   1. Add property → **URL prefix** → paste your exact address.
   2. Choose the **HTML tag** method and copy only the `content="..."` value.
   3. In Render, set `GOOGLE_SITE_VERIFICATION` to that value, wait for the redeploy, then click **Verify**.
   4. **Sitemaps** → submit `sitemap.xml`.
   5. **URL inspection** → paste your home address → **Request indexing**.
3. **Google Business Profile** (business.google.com). This matters most for a restaurant: it is what produces the
   map card and the panel when someone searches the name. Claim the listing for the restaurant at
   236-238 Linthorpe Road (it may exist under the old name), set the name to "Sambal & Sakura", and add the website.
4. **Make the details real and consistent.** Replace the placeholder phone, email and social links in
   Admin → Site content. Use the same name, address and phone on the website, Google Business Profile and social pages.
5. **Link to the site** from the Instagram, Facebook and TikTok bios.

Expect days to a few weeks before the name search shows the site. Nobody can make it instant. To check progress,
search `site:` followed by your address, or look at Search Console → Pages.

### Being found by AI assistants (ChatGPT, Perplexity, Gemini, Claude, Google AI answers)

What the website already does: the opening hours, address, phone, delivery area and the whole menu are in the
page text (not hidden behind JavaScript), the restaurant and the menu are described in the structured format
search and AI tools read, both spellings "Sambal & Sakura" / "Sambal and Sakura" are declared, the FAQ answers are in
the page, the Contact page has a plain-language "at a glance" summary built from your live settings, and there are
`/llms.txt` and `/llms-full.txt` summaries. `robots.txt` allows AI crawlers by name (GPTBot, ClaudeBot, PerplexityBot,
Google-Extended and others) on the public pages, and every public page arrives fully written in the first response
(crawlers that don't run JavaScript still see the whole page).

What it cannot do: AI assistants mostly repeat what trusted **other** places say about a business. These are yours to do:

1. **Bing Webmaster Tools** (bing.com/webmaster): add the site, choose the HTML meta tag method, put the code in
   Render as `BING_SITE_VERIFICATION`, then submit the sitemap. Bing's index feeds ChatGPT search and Copilot.
2. **Google Business Profile**, plus **Apple Business Connect** (Apple Maps and Siri), **TripAdvisor** and **Facebook**:
   claim each listing with the same name, address, phone and website. Consistency across these is the strongest signal.
3. **Real reviews.** Ask genuine customers to review on Google and TripAdvisor. Assistants quote review sites heavily.
4. **Keep the settings truthful.** The hours, delivery area and menu you set in the admin are what the website, the
   summaries and Google all repeat. If they are wrong, assistants will repeat the wrong thing.
5. **Check monthly.** Ask ChatGPT, Perplexity, Gemini and Google things like "Sambal and Sakura Middlesbrough opening hours"
   and "does Sambal and Sakura deliver" and note what each says. New sites often take weeks or months to appear.

Honest limits: no one can guarantee being named by an AI assistant, and no major AI company has confirmed that it reads
`/llms.txt`. The page text and structured data above are the parts that are known to matter.

### NFC review card (tap to leave a Google review)

Google does not sell a tap card. These are ordinary NFC cards with a link written on them. Tapping a phone on one just opens the link.

1. **Get your Google review link.** Sign in at business.google.com with the account that owns the restaurant's profile
   (it must be verified). Open the profile and choose **Ask for reviews**, then copy the link
   (it starts with `https://g.page/r/...`).
2. **Save it in the admin:** Admin -> Site content -> Business details -> **Google review link**, then press **Save**.
3. **Program the card with your own address, not the Google link:** `https://YOUR-DOMAIN/review`. That address forwards to the
   Google link from step 2, so if the link ever changes you edit it in the admin and **never reprogram a card**.
4. **Buy blank NFC cards** (NTAG213, NTAG215 or NTAG216 stickers or cards cost pennies each). Be careful with pre-printed
   "review cards" that only work through the seller's own subscription website: you could be locked into monthly fees.
5. **Write the link** with the free **NFC Tools** app (iPhone or Android): Write -> Add a record -> URL -> paste the address
   from step 3 -> Write -> hold the card to the top of the phone. Then test it with a different phone.
6. **Do NOT lock (make read-only) the card.** Locking cannot be undone and you gain nothing, because the address on the card never has to change.
7. **Always add a QR code** of the same address next to the tap area. Some phones have NFC switched off.

Use the **live domain** for step 3 (not a test address), because the card must keep working forever.

Rules: never offer a discount, points or a prize for a review, and never ask only happy customers. Google bans both.

## 7. Changing the database later

Edit `prisma/schema.prisma` (the single source of truth), then:

```bash
npm run db:migrate                       # creates + applies a SQLite migration locally
```

Production uses its own migration history in `prisma/postgres/migrations`. To add a production migration for a schema change, create it against a dev Postgres:

```bash
node scripts/prepare-postgres.mjs
DATABASE_URL="postgresql://..." npx prisma migrate dev --schema prisma/postgres/schema.prisma --name describe_change
```

Commit the new folder under `prisma/postgres/migrations`. It is applied automatically on the next deploy. Never edit a migration that has already been deployed.

## Do NOT

- Run `npm run db:seed` against production. It deletes all orders and customers and creates demo accounts with well-known passwords (`admin1234`, `password`). The script now refuses to run unless `DATABASE_URL` is a local SQLite file, but don't rely on that.
- Use Render's **free** web plan. It sleeps when idle, so the first customer waits 30-60 seconds.
- Put real keys in `render.yaml` or anywhere in Git. Use the dashboard.

## Going live: switch to paid (about 10 minutes, ~$13/mo)

Do this before the restaurant takes real orders (the setup fee covers it). Nothing in the app code changes.

1. **Web service:** Render → your service → Settings → Instance type → **Starter**. Also change `plan: free` to `plan: starter` in `render.yaml` so the two match.
2. **Database:** Render → New → **PostgreSQL**: plan **Basic-256mb**, region **Frankfurt** (same as the site), Postgres 16. Under Networking, remove all allowed IP addresses so only your Render services can reach it.
3. **Move the data** (from your computer, during a quiet moment):
   ```bash
   pg_dump --no-owner --no-acl "NEON_DIRECT_URL" > sambal.sql
   psql "RENDER_EXTERNAL_URL" < sambal.sql
   ```
   (Temporarily allow your own IP on the Render database for this, then remove it again.)
4. **Point the site at it:** set `DATABASE_URL` to the Render database's **Internal** URL and delete `DIRECT_DATABASE_URL`. Render redeploys.
5. **Optional:** move the migration + `create-admin` commands from `buildCommand` back into a `preDeployCommand:` (paid plans have it), so migrations run just before the new version goes live.
6. Check: sign in to the admin, place a test order, open `/api/health?db=1`. Then delete the Neon project.

Backups on paid Render Postgres: continuous, restore to any point in the last 3 days (7 days on a Render Pro workspace), plus manual backup files from the database's Recovery page (kept 7 days).

