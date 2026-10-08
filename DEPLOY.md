# Deploying Sambal & Sakura to Render

Total running cost: about **£5.50/mo** (Render Starter) with a free Neon database, or about **£11/mo** with Render Postgres. Check render.yaml's plan and Render's pricing page before quoting a client.

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
| PrintNode | Auto-print kitchen tickets | Optional |
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

## 3. Create the database

**Neon (free):** create a project, then copy the **direct** connection string (not the "pooled" one). It looks like `postgresql://user:pass@ep-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require`.

**Or Render Postgres (~£5-6/mo):** create one, then copy the **External** Database URL.

## 4. Create the Render service

1. Render dashboard → **New → Blueprint** → pick your GitHub repo. It reads `render.yaml`.
2. Fill in the secrets Render asks for (`sync: false` values):
   - `DATABASE_URL`: the string from step 3
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters): your owner login
   - Any optional keys you have (Cloudinary, Google, Groq, PrintNode, WeChat)
3. Click **Apply**. The first deploy takes a few minutes.

On every deploy Render will: install, derive the Postgres schema, generate the client, build the site, **apply database migrations**, **create the owner account if none exists** (it never overwrites an existing one), and check `/api/health` before switching traffic.

## 5. After the first deploy

1. Open `https://YOUR-SERVICE.onrender.com/staff/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Change the password** in Admin → Settings.
3. Check the Admin → Menu, Careers and Promotions pages. Edits appear on the public site immediately.
4. Open **Admin → Site content** and fill in the real phone, email, address, opening hours and social links (these are placeholders until you do). Opening hours also control which times customers can book.
5. **Replace or hide the sample reviews** (Site content → Reviews). They are invented placeholders. Showing made-up reviews as real ones can breach UK consumer law, and it also feeds a fake star rating to Google. Switch "Show reviews" off until you have real ones.

### Custom domain
Render → your service → **Settings → Custom Domains**, add `sambalandsakura.co.uk`, then create the DNS records Render shows. SSL is automatic and free. Set `WECHAT_NOTIFY_URL` to use the final domain.

### Menu photos (Cloudinary)
In Cloudinary: Settings → Upload → add an **unsigned** upload preset. Set `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` in Render's Environment tab.

### WeChat Pay
Set **all** of `WECHAT_APPID`, `WECHAT_MCHID`, `WECHAT_SERIAL_NO`, `WECHAT_PRIVATE_KEY`, `WECHAT_NOTIFY_URL`, `WECHAT_API_V3_KEY` and `WECHAT_PLATFORM_PUBLIC_KEY`. In the merchant console, set the payment notification URL to `https://YOUR-DOMAIN/api/pay/wechat/notify`.

The payment-confirmation code is tested (signature verification, replay protection, amount check) against simulated WeChat messages, **but it has not been run against live WeChat**. Do one real small test payment before announcing it. Until all the keys are set, WeChat is hidden from customers and cash still works.

## 6. Changing the database later

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

- Run `npm run db:seed` against production. It creates demo accounts with well-known passwords (`admin1234`, `password`).
- Use Render's **free** web plan. It sleeps when idle, so the first customer waits 30-60 seconds.
- Put real keys in `render.yaml` or anywhere in Git. Use the dashboard.
