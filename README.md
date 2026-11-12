# 知点 · 个人知识库

A standalone static knowledge-card app. It does not call ChatGPT or the OpenAI API.

## Features

- Create and edit front/back knowledge cards.
- Search card prompts, explanations, and tags.
- Add one topic tag and a mastery label to each card.
- Link related cards and navigate between them.
- Export and import a JSON backup.

## Data and privacy

Cards are stored in the current browser's local storage. They are not uploaded to this repository or to a server. Each browser and device has its own copy. Export a JSON backup before changing the site URL; import it after opening the new URL.

The repository contains the application source and sample cards only. Do not commit personal card exports.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml` publishes the `dist/` directory whenever a commit is pushed to `main`. In the repository settings, enable GitHub Pages with **Build and deployment → Source → GitHub Actions**. The deployment URL appears in the Actions run and Pages settings.

GitHub Free requires the Pages repository to be public. This public repository contains the app code, not cards saved in a visitor's browser.

To use a custom domain later, add it in **Settings → Pages → Custom domain**, then configure the DNS records GitHub displays.
