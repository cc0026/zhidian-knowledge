# 知点 · 个人知识库

A standalone static knowledge-card app. It does not call ChatGPT or the OpenAI API.

## Website

Open the published app at [https://cc0026.github.io/zhidian-knowledge/](https://cc0026.github.io/zhidian-knowledge/).

## Features

- Create and edit front/back knowledge cards.
- Format explanations with bold, italic, highlight, math, and code tools; insert compressed images by upload or clipboard paste.
- Search card prompts, explanations, and tags.
- Add one topic tag and a mastery label to each card.
- Link related cards and navigate between them.
- Swipe left or right on a phone, or use the keyboard arrow keys, to move through cards; in **漫游**, navigation revisits viewed cards or draws another random card.
- Save cards locally with automatic synchronization across open tabs in the same browser.
- Sign in with Supabase to sync cards across devices.
- Export or import a JSON backup.

## Data and privacy

Cards are saved in the current browser so they remain available offline. Sign in through **账号与云端同步** to sync private cards across devices. Each account has an isolated cloud card set, while signed-out cards remain in that browser. The app keeps the local copy and supports JSON export as a backup.

The Supabase project setup and database schema are in [`supabase/SETUP.md`](supabase/SETUP.md) and [`supabase/schema.sql`](supabase/schema.sql). Cloud sync works after the schema has been applied in Supabase. The browser uses only the public publishable key; row-level security limits each account to its own data.

Cards are no longer loaded from or published through GitHub. Use **账号与云端同步** to access the same private card set on another device, and use JSON export/import for manual backups or transfers. Images uploaded in the editor are resized and compressed, then stored inside the card text; larger images make backup files larger.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` publishes the `dist/` directory whenever a commit is pushed to `main`. In the repository settings, enable GitHub Pages with **Build and deployment → Source → GitHub Actions**.

GitHub Free requires the Pages repository to be public. The application source is public; Supabase restricts card data to each account through row-level security.

To use a custom domain later, add it in **Settings → Pages → Custom domain**, then configure the DNS records GitHub displays.
