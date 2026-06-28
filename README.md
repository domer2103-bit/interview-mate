# Interview Mate

A lightweight, fast interview prep tool that generates a structured prep pack tailored to any role — instantly in the browser, no account required.

## Features

- Generate a full prep pack from a job title + optional context (seniority, company, industry, interview type)
- 8 sections: role summary, research checklist, likely questions, answer guidance, dress advice, body language tips, questions to ask, and a 24-hour checklist
- Copy to clipboard or download as Markdown
- Save recent sessions in browser storage — no sign-in needed
- Works 100% client-side (local fallback), or with OpenAI for smarter, more tailored output

## Live

Open `index.html` in any browser for instant use — no build step, no dependencies.

## Run with OpenAI (optional)

For AI-powered output, start the local server with your OpenAI API key:

```bash
# Python
OPENAI_API_KEY=your_key_here python3 server.py

# Node
OPENAI_API_KEY=your_key_here node server.js
```

Then open `http://127.0.0.1:4173`.

The app automatically falls back to the built-in generator when the server is unavailable.

## Recommended model

`gpt-4.1-mini` (default) — good quality, low cost. Change `OPENAI_MODEL` to upgrade.

## Stack

- Vanilla HTML, CSS, JavaScript — no build tools, no frameworks
- Optional: Node.js (`server.js`) or Python (`server.py`) for the OpenAI bridge
