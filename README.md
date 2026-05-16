# Link Up at the Party

A simple Next.js full-stack starter for creating shareable party session links.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current flow

- `/` shows the landing page with the pineapple create-link button.
- `/create` collects party name, host name, location, date/time, and an optional note.
- `POST /api/sessions` validates the form data and creates an in-memory session.
- `/p/[slug]` shows the generated party page.

Sessions are stored in memory for this first pass, so generated links reset when the dev server restarts.
