# Secure Groq setup

This project keeps the Groq API key on the Node server. The browser sends questions to `/api/ask`; it never receives the key.

## Setup

1. Install Node.js 18 or newer.
2. Put your Groq API key in `.env`:

```env
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=openai/gpt-oss-120b
PORT=5500
HOST=127.0.0.1
```

3. Start the app from this folder:

```bash
npm start
```

4. Open [http://127.0.0.1:5500](http://127.0.0.1:5500).

Do not put the key in `script.js`, `index.html`, Firebase config, or any public repository.

## Troubleshooting

- `Groq is not configured yet`: confirm the file is named `.env` and is in the same folder as `server.js`.
- `Unable to get an AI response`: check the terminal output and confirm the key has available API access.
