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
- Use the round arrows below any card to move through the current list; in **漫游**, the arrows revisit viewed cards or draw another random card.
- Save cards locally with automatic synchronization across open tabs in the same browser.
- Export a `cards.json` file to publish or move cards to another device.
- Load the published card set from GitHub Pages or import a JSON backup.

## Data and privacy

Cards are saved in the current browser so they remain available offline. Sign in through **账号与云端同步** to sync private cards across devices. Each account has an isolated cloud card set, while signed-out cards remain in that browser. The app keeps the local copy and supports JSON export as a backup.

The Supabase project setup and database schema are in [`supabase/SETUP.md`](supabase/SETUP.md) and [`supabase/schema.sql`](supabase/schema.sql). Cloud sync works after the schema has been applied in Supabase. The browser uses only the public publishable key; row-level security limits each account to its own data.

To publish or replace the shared starter card set:

1. Select **导出 cards.json** in the sidebar.
2. Upload the downloaded file to `dist/cards/cards.json` in this repository, replacing the existing file, and commit the change to `main`.
3. GitHub Actions redeploys the site. On another device, open the website to load the published cards. If that browser already has a local card set, select **从 GitHub 载入卡片** and confirm replacement.

Images uploaded in the editor are resized and compressed, then stored inside the card text. They travel with JSON exports and backups; larger images make the JSON file larger. The published JSON file is public because this repository and its GitHub Pages site are public. Do not publish sensitive or private cards here. Keep a separate backup before replacing the repository file.

The repository contains the application and the public card set in `dist/cards/cards.json`.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` publishes the `dist/` directory whenever a commit is pushed to `main`. In the repository settings, enable GitHub Pages with **Build and deployment → Source → GitHub Actions**.

GitHub Free requires the Pages repository to be public. The application and the published card set in this repository are public; unpublished browser-local cards are not included until exported and committed.

To use a custom domain later, add it in **Settings → Pages → Custom domain**, then configure the DNS records GitHub displays.
