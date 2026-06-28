const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ROOT = __dirname;

const MIME = {
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
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "POST" && url.pathname === "/api/generate") {
    try {
      const body = await readJson(req);
      const pack = await generatePackWithOpenAI(body?.input || {}, Number(body?.seed || 0));
      sendJson(res, 200, { ok: true, model: OPENAI_MODEL, pack });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "OpenAI request failed",
      });
    }
    return;
  }

  const filePath = resolveFilePath(url.pathname);
  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Interview Mate running at http://127.0.0.1:${PORT}`);
});

async function generatePackWithOpenAI(input, seed) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You create practical interview prep packs. Return only valid JSON with top-level keys meta, roleSummary, researchChecklist, likelyQuestions, answerGuidance, dressCode, behaviorTips, questionsToAsk, prepChecklist, confidenceBoosters. meta must include title, generatedAt, summary. likelyQuestions must be an array of objects with question, why, answer. Keep the advice organized, specific, and actionable. Do not use markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            input,
            seed,
            instructions: "Tailor the pack to the role and keep the tone practical and concise.",
          }),
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI returned ${response.status}`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty OpenAI response");
  }

  const pack = JSON.parse(content);
  normalizePack(pack, input);
  return pack;
}

function normalizePack(pack, input) {
  const fallbackTitle = `${input?.seniority ? `${input.seniority} ` : ""}${input?.jobTitle || "Interview Pack"}${input?.companyName ? ` @ ${input.companyName}` : ""}`.trim();
  pack.meta = pack.meta || {};
  pack.meta.title = pack.meta.title || fallbackTitle;
  pack.meta.generatedAt = pack.meta.generatedAt || new Date().toISOString();
  pack.meta.summary = pack.meta.summary || "Tailored interview prep pack";

  for (const key of ["researchChecklist", "answerGuidance", "behaviorTips", "questionsToAsk", "prepChecklist", "confidenceBoosters"]) {
    if (!Array.isArray(pack[key])) {
      pack[key] = [];
    }
  }

  if (!Array.isArray(pack.likelyQuestions)) {
    pack.likelyQuestions = [];
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function resolveFilePath(requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    return null;
  }
  return filePath;
}
