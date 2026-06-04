# Standardised Work Builder

Standalone Vite/React version of the Standardised Work Builder app.

## Target Hosting

Recommended target: Vercel.

Why:
- It hosts the React frontend and `/api/openai` serverless endpoint in one app.
- The OpenAI API key stays server-side.
- No authentication is required.
- The build output remains a simple Vite static app.

## What Changed From Base44

- Base44 SDK removed from the runtime path.
- Base44 Vite plugin removed.
- Entity calls now use a standalone compatibility client backed by browser `localStorage`.
- File uploads are stored locally as text/data URLs.
- AI calls now go through `/api/openai`.
- Login is disabled; the app uses a local admin user automatically.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set this in `.env.local`:

```bash
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-5.4-mini
```

## Vercel Setup

1. Import the project into Vercel.
2. Add environment variables:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` optional, defaults to `gpt-5.4-mini`
   - `VITE_STORAGE_MODE=remote` for shared global storage
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SETTINGS_PIN` optional, defaults to `2468`
   - `SETTINGS_PIN_SECRET` recommended random string for signed settings access
3. Build command: `npm run build`
4. Output directory: `dist`

## Storage Modes

### Local Mode

Set `VITE_STORAGE_MODE=local` or leave it unset.

- No central login.
- No shared process database between users.
- A process created on one computer stays on that computer/browser.
- Clearing browser storage clears app data.

### Remote Mode

Set `VITE_STORAGE_MODE=remote`.

Remote mode gives the app global shared storage through the `/api/storage` endpoint and Supabase. It still has no user login: everyone who can open the app can read and write the shared workspace.

Settings changes are PIN-protected. The Settings page verifies the PIN through `/api/settings-pin`, then `/api/storage` requires that verified token before it accepts global `AppSettings` updates.

Supabase setup:

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase-schema.sql`.
4. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel environment variables.

Because the Supabase service role key is only used inside `/api/storage`, it is not exposed to the browser.

For a light access boundary without user accounts, put the Vercel deployment behind Vercel password protection or add a shared workspace PIN later.
