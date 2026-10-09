# AnnaSetu

Near-expiry packaged food from shops near you. Shops add stock with two photos and a voice note;
donors say what they want to do and get ready-made kits from nearby shops.

## Run it

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (free: https://aistudio.google.com/apikey)
npm run dev                  # http://localhost:3000
```

- Without Supabase keys, data is saved in `.data/`. With Supabase: run `supabase/schema.sql` in the
  SQL editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Voice works best in Chrome (desktop or Android). The browser asks for microphone permission.

## On a phone

Camera and microphone need HTTPS on phones. Easiest: `npx ngrok http 3000` (or deploy to Vercel) and
open the https link on the phone.

## Tests

`npm test`
