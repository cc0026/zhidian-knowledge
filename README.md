# 知点 · 个人知识库

A standalone static knowledge-card app. It does not call ChatGPT or the OpenAI API.

## Website

Open the published app at [https://cc0026.github.io/zhidian-knowledge/](https://cc0026.github.io/zhidian-knowledge/).

## Features

- Create and edit front/back knowledge cards.
- Search card prompts, explanations, and tags.
- Add one topic tag and a mastery label to each card.
- Link related cards and navigate between them.
- Create and edit cards locally, then export a `cards.json` file for publishing.
- Load the published card set from GitHub Pages or import a JSON backup.

## Data and privacy

Cards you create in the app are saved in the current browser's local storage. To publish them across devices:

1. Select **导出 cards.json** in the sidebar.
2. Upload the downloaded file to `dist/cards/cards.json` in this repository, replacing the existing file, and commit the change to `main`.
3. GitHub Actions redeploys the site. On another device, open the website to load the published cards. If that browser already has a local card set, select **从 GitHub 载入卡片** and confirm replacement.

The published JSON file is public because this repository and its GitHub Pages site are public. Do not publish sensitive or private cards here. Keep a separate backup before replacing the repository file.

The repository contains the application and the public card set in `dist/cards/cards.json`.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` publishes the `dist/` directory whenever a commit is pushed to `main`. In the repository settings, enable GitHub Pages with **Build and deployment → Source → GitHub Actions**.

GitHub Free requires the Pages repository to be public. The application and the published card set in this repository are public; unpublished browser-local cards are not included until exported and committed.

To use a custom domain later, add it in **Settings → Pages → Custom domain**, then configure the DNS records GitHub displays.
