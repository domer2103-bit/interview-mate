#!/usr/bin/env python3
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "4173"))
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/generate":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            body = json.loads(raw)
            pack = generate_pack(body.get("input", {}), int(body.get("seed", 0)))
            self._send_json(200, {"ok": True, "model": OPENAI_MODEL, "pack": pack})
        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc)})

    def do_GET(self):
        request_path = self.path.split("?", 1)[0]
        safe_path = "/index.html" if request_path == "/" else request_path
        file_path = (ROOT / safe_path.lstrip("/")).resolve()

        if ROOT not in file_path.parents and file_path != ROOT / "index.html":
            self.send_error(404)
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error(404)
            return

        self.send_response(200)
        self.send_header("Content-Type", MIME.get(file_path.suffix.lower(), "application/octet-stream"))
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def log_message(self, format, *args):
        return

    def _send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def generate_pack(input_data, seed):
    if not OPENAI_API_KEY:
        raise RuntimeError("Missing OPENAI_API_KEY")

    prompt = {
        "input": input_data,
        "seed": seed,
        "instructions": "Tailor the pack to the role and keep the tone practical and concise.",
    }

    payload = {
        "model": OPENAI_MODEL,
        "temperature": 0.7,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You create practical interview prep packs. Return only valid JSON with top-level keys "
                    "meta, roleSummary, researchChecklist, likelyQuestions, answerGuidance, dressCode, "
                    "behaviorTips, questionsToAsk, prepChecklist, confidenceBoosters. meta must include "
                    "title, generatedAt, summary. likelyQuestions must be an array of objects with question, "
                    "why, answer. Keep the advice organized, specific, and actionable. Do not use markdown."
                ),
            },
            {"role": "user", "content": json.dumps(prompt)},
        ],
    }

    request = Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urlopen(request, timeout=120) as response:
        data = json.loads(response.read().decode("utf-8"))

    if "error" in data:
        raise RuntimeError(data["error"].get("message", "OpenAI request failed"))

    content = data["choices"][0]["message"]["content"]
    pack = json.loads(content)
    normalize_pack(pack, input_data)
    return pack


def normalize_pack(pack, input_data):
    seniority = f"{input_data.get('seniority')} " if input_data.get("seniority") else ""
    company = f" @ {input_data.get('companyName')}" if input_data.get("companyName") else ""
    fallback_title = f"{seniority}{input_data.get('jobTitle', 'Interview Pack')}{company}".strip()
    meta = pack.setdefault("meta", {})
    meta.setdefault("title", fallback_title)
    meta.setdefault("generatedAt", __import__("datetime").datetime.utcnow().isoformat() + "Z")
    meta.setdefault("summary", "Tailored interview prep pack")

    for key in ["researchChecklist", "answerGuidance", "behaviorTips", "questionsToAsk", "prepChecklist", "confidenceBoosters"]:
        if not isinstance(pack.get(key), list):
            pack[key] = []

    if not isinstance(pack.get("likelyQuestions"), list):
        pack["likelyQuestions"] = []


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Interview Mate running at http://127.0.0.1:{PORT}")
    server.serve_forever()
