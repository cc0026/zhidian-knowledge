# Supabase setup

## 1. Create a project

Create a Supabase project on the Free plan. Keep the database password private; it is not needed by the website.

## 2. Create the private data tables

Open **SQL Editor**, paste the contents of `schema.sql`, and run it. The tables store per-account cards, custom tags, and review progress. Row Level Security policies restrict each account to its own rows.

## 3. Configure Auth URLs

In **Authentication → URL Configuration**, set the production Site URL to:

`https://cc0026.github.io/zhidian-knowledge/`

Add the same URL to Redirect URLs. Add a localhost URL only if using a local development server.

## 4. Configure the static client

The static website uses the Project URL and public publishable key in `dist/supabase-config.js`. These values are designed to be used in browser code; Row Level Security protects the data. The supplied project URL and publishable key are already filled in there.

Never put the `service_role` or `sb_secret_...` key in the website, Git repository, or a message. The database password is also not needed by the browser app.

## 5. Email sign-in

Hosted Supabase projects need a custom SMTP provider to send confirmation and password-reset emails to arbitrary addresses. The built-in sender is for limited testing. Google sign-in is another option if preferred.
