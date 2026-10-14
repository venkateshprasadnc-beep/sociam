# Sociam Studio: publishing setup (Decap CMS + GitHub + Cloudflare Pages)

You chose Decap CMS with GitHub (14 October 2026). This guide gets you from this folder to a working dashboard at `/cms`, where you can write, preview, schedule, publish and edit articles without touching code.

## How it works

```
You write in Sociam Studio (/cms)  ->  Decap saves to GitHub  ->  Cloudflare Pages runs `node build.mjs`  ->  site updated
```

- **Articles** are files in `content/posts/` (JSON details, then the Markdown text). You never edit them by hand; the Studio does.
- **Design and code** (`src/`, `public/assets/`, `functions/`) stay separate and change only through GitHub commits.
- **Homepage and blog lists** rebuild automatically on every publish. Nobody edits `index.html` for content.
- **Drafts** live on their own GitHub branch, so nothing is public until you click **Publish**.
- **Scheduling**: set a future publish date. A GitHub Action checks hourly and rebuilds when an article falls due.

## Cost and accounts

| Service | Plan | Cost | What you need |
|---|---|---|---|
| GitHub | Free | $0 | An account (with two-factor sign-in on) and a private repository |
| Cloudflare Pages | Free | $0 | Your existing Cloudflare account; up to 500 builds a month |
| Decap CMS | Open source | $0 | Nothing; it loads from unpkg.com |
| Resend (lead emails, optional) | Free tier | $0 | A verified sending domain and an API key |
| Anthropic (Ask Sociam, optional) | Pay as you go | Usage-based | An API key |

There are no paid plans and no WordPress hosting.

## What has been tested, and what has not

Tested on this computer:

- The Studio loads with the real `config.yml`, with no configuration errors.
- Creating a draft, previewing it, setting it Ready, publishing it, and editing the published article as a new draft all work. This used Decap's in-memory test backend in place of GitHub.
- The live preview shows the article in the site's styles, with a search-result snippet that has title and description length counters.
- The file Decap writes is read correctly by the site builder.
- The Cloudflare build (`build.mjs` with `lib/content.mjs`) and the local build (`build.ps1`) produce identical output for all 32 pages.
- Scheduled articles are held back, articles switched off are hidden, and custom URL slugs, related articles and Markdown formatting are handled.

**Not tested yet, because it needs your accounts:** GitHub sign-in, real commits, the Cloudflare build, and scheduled publishing.

The CMS isn't considered working until you complete the acceptance test in step 7.

## Step by step

### 1. Create the GitHub repository (10 minutes)

1. Sign up at github.com, or sign in, and turn on two-factor authentication.
2. Click **New repository**:
   - name it `sociam-site`;
   - choose **Private**;
   - don't add a README.
3. On the empty repository page, choose **uploading an existing file**.
4. Drag in **everything inside** the `sociam-site` folder, including the hidden `.github` folder and the `.gitignore` file.
5. Commit to `main`.
6. Check that `content/posts`, `public/cms` and `.github/workflows` all appear in the repository. Windows hides folders whose names start with a dot: in File Explorer, choose **View > Show > Hidden items**.

### 2. Point the Studio at your repository

In the repository, open `public/cms/config.yml`, click the pencil icon and change these two lines:

```yaml
  repo: YOUR-GITHUB-USERNAME/sociam-site
  base_url: https://sociam-site.pages.dev   # until go-live; later https://sociam.in
```

Commit.

### 3. Connect Cloudflare Pages (preview address only; your live site is not touched)

1. In Cloudflare, go to **Workers and Pages > Create > Pages > Connect to Git**. Authorise GitHub and pick `sociam-site`.
2. Enter the build settings:
   - framework preset: **None**;
   - build command: `node build.mjs`;
   - output directory: `public`.
3. Under environment variables, add `NODE_VERSION` = `20`.
4. Click **Save and deploy**. You'll get an address such as `https://sociam-site.pages.dev`.
5. Go to **Settings > Bindings** and add a D1 database binding: variable name `DB`, database `sociam`. If Cloudflare reports that `wrangler.toml` manages this, it's already done.

### 4. Create the GitHub sign-in app

1. On GitHub, open **Settings > Developer settings > OAuth Apps > New OAuth App**, and fill in:
   - Application name: Sociam Studio
   - Homepage URL: `https://sociam-site.pages.dev`
   - Authorization callback URL: `https://sociam-site.pages.dev/api/cms-callback`
2. Copy the **Client ID**, then click **Generate a new client secret** and copy it.
3. In Cloudflare Pages, open **Settings > Variables and Secrets** and add two **encrypted** secrets:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
4. Go to **Deployments** and use **Retry deployment** on the latest deployment, so the secrets take effect.

### 5. Turn on scheduled publishing

1. In Cloudflare Pages, open **Settings > Builds > Deploy hooks**, add a hook named `scheduled`, and copy its URL.
2. In GitHub, open the repository's **Settings > Secrets and variables > Actions > New repository secret**. Name it `CLOUDFLARE_DEPLOY_HOOK` and paste the URL.

### 6. Other secrets (as needed)

Add these in Cloudflare Pages under Variables and Secrets, all encrypted:

- `RESEND_API_KEY`, for lead emails;
- `ANTHROPIC_API_KEY`, for Ask Sociam;
- `ADMIN_TOKEN`, for the `/admin` lead pipeline.

Also set `MAIL_FROM` in `wrangler.toml` once the Resend domain is verified.

### 7. Acceptance test (you do this)

1. Open `https://sociam-site.pages.dev/cms`, click **Login with GitHub** and approve.
2. Click **New Article**, then fill in the title, excerpt and some text, and pick a section. Click **Save**: this is a draft.
3. Check the preview pane on the right: it shows the real site styles and the search snippet.
4. Open the **Workflow** tab: your draft is in "Drafts". Drag it to **Ready**, or set the status in the editor.
5. Click **Publish > Publish now**. After one to two minutes, the article appears at `/blog`, on the homepage and in the sitemap.
6. Open the article in the Studio again, change a sentence, click **Save**, then **Publish** again. After a couple of minutes, the live page shows the change.
7. Optional: create another article with a publish date 10 minutes ahead and publish it. It goes live on the next hourly check after that time.

Once all of this works, the CMS is working. If any step fails, send me the message you see.

### 8. Go-live (only with your explicit approval)

Today sociam.in is served by a Cloudflare Worker, either `dark-mountain-5eeb` or `bold-water-f633`; we'll confirm which together.

The switch, when you approve it:

1. Add `sociam.in` and `www.sociam.in` under Pages **Custom domains**.
2. Remove the domain route from the old Worker. Don't delete the Worker: it's the rollback.
3. Update `base_url` in `config.yml` to `https://sociam.in`.
4. Add `https://sociam.in/api/cms-callback` to the GitHub OAuth App, or create a second app for the live domain.

Rollback: re-attach the route to the old Worker. That takes a few minutes, and there's no data loss because leads live in D1.

## Everyday use

| Task | In Sociam Studio |
|---|---|
| Write | Articles > New Article |
| Save a draft | Save (it stays private) |
| Preview | The right-hand pane, live as you type |
| Publish | Set status to Ready, then Publish > Publish now |
| Schedule | Set Publish date in the future, then publish |
| Edit a live article | Open it, change it, Save, Publish |
| Take an article down | Switch off **Show on the website**, then publish |
| Feature on the blog | Switch on **Feature at the top of the blog** |
| Images | Featured image field, or the image button in the editor (under 2 MB, landscape) |
| SEO | URL slug, SEO title, Meta description, Social sharing image and Keywords, at the end of the form |
| Related articles | Pick up to three, or leave empty for automatic suggestions |

## Files involved

- `public/cms/index.html`, `config.yml`, `preview.js`, `preview.css`: the Studio itself
- `functions/api/cms-auth.js`, `functions/api/cms-callback.js`: GitHub sign-in
- `content/posts/*.md`: the articles
- `lib/content.mjs` and `build.mjs`: the site builder that Cloudflare runs
- `build.ps1`: the same builder for previewing on this Windows PC (`Preview Sociam.cmd`)
- `.github/workflows/scheduled-publish.yml`: hourly scheduled publishing
- `tools/cms-local-test.html`: an in-memory Studio for offline testing (not deployed)
