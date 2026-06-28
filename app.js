const STORAGE_KEY = "interview_prep_pro_history_v1";
const API_KEY_STORAGE = "interview_mate_openai_key";

const form = document.getElementById("prepForm");
const resultsGrid = document.getElementById("resultsGrid");
const emptyState = document.getElementById("emptyState");
const resultsSummary = document.getElementById("resultsSummary");
const historyList = document.getElementById("historyList");
const historyItemTemplate = document.getElementById("historyItemTemplate");

const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const saveBtn = document.getElementById("saveBtn");
const regenerateBtn = document.getElementById("regenerateBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const submitBtn = form.querySelector('button[type="submit"]');
const settingsBtn = document.getElementById("settingsBtn");
const apiKeyModal = document.getElementById("apiKeyModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const removeKeyBtn = document.getElementById("removeKeyBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const modalStatus = document.getElementById("modalStatus");
const footnoteText = document.getElementById("footnoteText");

const output = {
  roleSummary: document.getElementById("roleSummary"),
  researchChecklist: document.getElementById("researchChecklist"),
  likelyQuestions: document.getElementById("likelyQuestions"),
  answerGuidance: document.getElementById("answerGuidance"),
  dressCode: document.getElementById("dressCode"),
  behaviorTips: document.getElementById("behaviorTips"),
  questionsToAsk: document.getElementById("questionsToAsk"),
  prepChecklist: document.getElementById("prepChecklist"),
  confidenceBoosters: document.getElementById("confidenceBoosters"),
};

let currentPack = null;
let currentInput = null;
let history = loadHistory();
let variantSeed = 0;

const seniorityMap = {
  "": "mid-level",
  "Junior": "junior",
  "Mid-level": "mid-level",
  "Senior": "senior",
  "Lead": "lead",
  "Principal": "principal",
};

const interviewAngles = {
  "General screen": "clarity, motivation, and fit",
  "Hiring manager": "ownership, collaboration, and decision-making",
  "Panel": "communication, consistency, and depth",
  "Final round": "strategy, leadership, and long-term impact",
  "Technical": "problem solving, rigor, and trade-offs",
  "Behavioral": "self-awareness, structure, and examples",
};

form.addEventListener("submit", (event) => {
  void handleGenerate(event);
});

regenerateBtn.addEventListener("click", () => {
  void handleRegenerate();
});

copyBtn.addEventListener("click", async () => {
  if (!currentPack) return;
  await copyToClipboard(toMarkdown(currentPack));
  copyBtn.textContent = "Copied";
  setTimeout(() => {
    copyBtn.textContent = "Copy";
  }, 1400);
});

downloadBtn.addEventListener("click", () => {
  if (!currentPack) return;
  const blob = new Blob([toMarkdown(currentPack)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(currentPack.meta.title)}-prep-pack.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

saveBtn.addEventListener("click", () => {
  saveCurrentSession(true);
});

clearHistoryBtn.addEventListener("click", () => {
  history = [];
  persistHistory([]);
  renderHistory();
});

renderHistory();
setActionButtonsEnabled(false);
setLoadingState(false);
updateKeyUI();

// --- Modal wiring ---
settingsBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
apiKeyModal.addEventListener("click", (e) => { if (e.target === apiKeyModal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith("sk-")) {
    showModalStatus("Key must start with sk-", "error");
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, key);
  showModalStatus("Key saved ✓", "success");
  updateKeyUI();
  setTimeout(closeModal, 900);
});

removeKeyBtn.addEventListener("click", () => {
  localStorage.removeItem(API_KEY_STORAGE);
  apiKeyInput.value = "";
  showModalStatus("Key removed", "success");
  updateKeyUI();
});

function openModal() {
  const stored = localStorage.getItem(API_KEY_STORAGE) || "";
  apiKeyInput.value = stored;
  modalStatus.textContent = "";
  apiKeyModal.classList.remove("hidden");
  setTimeout(() => apiKeyInput.focus(), 60);
}

function closeModal() {
  apiKeyModal.classList.add("hidden");
}

function showModalStatus(msg, type) {
  modalStatus.textContent = msg;
  modalStatus.className = `modal-status modal-status--${type}`;
}

function updateKeyUI() {
  const hasKey = Boolean(localStorage.getItem(API_KEY_STORAGE));
  settingsBtn.textContent = hasKey ? "⚙ AI Key ✓" : "⚙ AI Key";
  settingsBtn.style.color = hasKey ? "var(--brand-3)" : "";
  if (footnoteText) {
    footnoteText.textContent = hasKey
      ? "AI mode active — packs will be generated by OpenAI using your saved key."
      : "Packs are generated instantly in your browser. Add your OpenAI key via ⚙ AI Key for smarter, AI-powered results.";
  }
}

function readForm() {
  const formData = new FormData(form);
  return {
    jobTitle: normalize(formData.get("jobTitle")),
    seniority: normalize(formData.get("seniority")),
    companyName: normalize(formData.get("companyName")),
    industry: normalize(formData.get("industry")),
    location: normalize(formData.get("location")),
    interviewType: normalize(formData.get("interviewType")),
    userGoal: normalize(formData.get("userGoal")),
    extraNotes: normalize(formData.get("extraNotes")),
  };
}

function normalize(value) {
  return String(value ?? "").trim();
}

async function handleGenerate(event) {
  event.preventDefault();
  const input = readForm();
  await generateAndApply(input, "Generate my prep pack");
}

async function handleRegenerate() {
  const input = currentInput ?? readForm();
  await generateAndApply(input, "Regenerate");
}

async function generateAndApply(input, buttonLabel) {
  variantSeed += 1;
  setLoadingState(true, buttonLabel);

  try {
    const pack = await generatePrepPackFromApi(input, variantSeed);
    applyPack(pack, input);
  } catch (error) {
    console.error(error);
    const pack = generatePrepPack(input, variantSeed);
    applyPack(pack, input);
    resultsSummary.textContent = `${pack.meta.title} · Local fallback used because the OpenAI request could not complete.`;
  } finally {
    setLoadingState(false, buttonLabel);
  }
}

async function generatePrepPackFromApi(input, seed) {
  const apiKey = localStorage.getItem(API_KEY_STORAGE);
  if (!apiKey) {
    throw new Error("No API key configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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
  // Normalise meta fields
  pack.meta = pack.meta || {};
  pack.meta.title = pack.meta.title ||
    `${input?.seniority ? `${input.seniority} ` : ""}${input?.jobTitle || "Interview Pack"}${input?.companyName ? ` @ ${input.companyName}` : ""}`.trim();
  pack.meta.generatedAt = pack.meta.generatedAt || new Date().toISOString();
  pack.meta.summary = pack.meta.summary || "Tailored interview prep pack";
  for (const key of ["researchChecklist", "answerGuidance", "behaviorTips", "questionsToAsk", "prepChecklist", "confidenceBoosters"]) {
    if (!Array.isArray(pack[key])) pack[key] = [];
  }
  if (!Array.isArray(pack.likelyQuestions)) pack.likelyQuestions = [];
  return pack;
}

function generatePrepPack(input, seed) {
  const role = input.jobTitle || "the role";
  const seniority = seniorityMap[input.seniority] || "mid-level";
  const company = input.companyName || "the company";
  const industry = input.industry || "the industry";
  const interviewType = input.interviewType || "General screen";
  const interviewAngle = interviewAngles[interviewType] || "role fit and impact";
  const focus = input.userGoal || `prepare for the ${interviewType.toLowerCase()} with confidence`;
  const companyRef = input.companyName ? `${input.companyName}` : "the organization";
  const locationRef = input.location ? `in ${input.location}` : "for the interview location you are targeting";
  const extra = input.extraNotes ? ` You also mentioned: ${input.extraNotes}` : "";

  const roleSummary = `${capitalize(seniority)} candidates for ${role} roles are usually evaluated on ${interviewAngle}. Expect the interviewers to care about concrete examples, how you think through trade-offs, and whether your communication style fits ${companyRef}. ${companySpecificNote(company, industry, interviewType)}${extra}`;

  const researchChecklist = unique([
    `${input.companyName ? `Review ${input.companyName}` : "Review the company"} homepage, mission, and current product priorities.`,
    `Map the role to the team: what problems would ${role.toLowerCase()} solve ${locationRef}?`,
    `Read recent launches, press, or case studies tied to ${industry || "the sector"}.`,
    interviewType === "Technical"
      ? "Prepare one or two examples that show how you solve hard problems step by step."
      : "Refresh 2 to 3 stories that show collaboration, ownership, and impact.",
    "Note the interviewers' likely goals and what signals they probably want to hear.",
  ]);

  const likelyQuestions = unique([
    {
      question: `Walk me through a project where you had to make a trade-off under pressure.`,
      why: `They want proof you can balance quality, speed, and constraints as a ${seniority} hire.`,
      answer: `Lead with the outcome, explain the constraint, then show how you chose a path and what happened after launch.`,
    },
    {
      question: `How do you prioritize when everything feels important?`,
      why: `This reveals how you structure ambiguous work and protect focus.`,
      answer: `Use a simple prioritization framework: impact, urgency, effort, and alignment to business goals.`,
    },
    {
      question: `Tell me about feedback you disagreed with and how you handled it.`,
      why: `Interviewers are checking self-awareness and collaboration.`,
      answer: `Show that you listened, asked clarifying questions, and made the final decision based on evidence rather than ego.`,
    },
    {
      question: input.companyName
        ? `Why do you want to join ${input.companyName}?`
        : `Why this company and why now?`,
      why: `They want to know whether you have specific motivation beyond a generic job search.`,
      answer: `Connect the company's work to your background, the team's challenges, and the growth you want next.`,
    },
    {
      question: `Tell me about a time you influenced people without formal authority.`,
      why: `This is a strong proxy for seniority, especially in cross-functional roles.`,
      answer: `Share how you aligned stakeholders, built trust, and moved the work forward.`,
    },
  ]).slice(0, 4 + (seed % 2));

  const answerGuidance = unique([
    "Answer in a shape: context, action, result, and reflection.",
    `Start with the business impact in the first sentence so the interviewer knows the story matters.`,
    `Use role-specific language that fits ${companyRef} without sounding scripted.`,
    "If you do not know something, say what you would do next instead of trying to improvise a fake answer.",
    "Keep each answer focused on one main point and stop before it turns into a ramble.",
  ]);

  const dressCode = dressAdvice(input.companyName, industry, interviewType);

  const behaviorTips = unique([
    "Sit forward slightly, keep your hands visible, and pause before answering difficult questions.",
    "Use deliberate eye contact and show that you are listening, not just waiting for your turn to speak.",
    "Mirror the interviewer’s energy, but keep your tone calm and professional.",
    "When a question is long, repeat the key constraint back to make sure you understood it.",
  ]);

  const questionsToAsk = unique([
    `What does success look like in the first 90 days for this ${role.toLowerCase()} role?`,
    `Which problem is the team most eager to solve right now?`,
    input.companyName
      ? `How does ${input.companyName} define great performance for this level?`
      : `How does the team define great performance at this level?`,
    `What usually slows down strong candidates once they join the team?`,
  ]);

  const prepChecklist = unique([
    "Review your top 3 stories and rehearse them out loud.",
    `Check the interview time, calendar, and timezone details.`,
    "Test your camera, audio, and screen sharing setup.",
    "Prepare a one-sentence summary of why this role is a fit.",
    `Print or open any notes you want to keep handy ${locationRef}.`,
    "Sleep, hydrate, and keep your environment quiet and clean.",
  ]);

  const confidenceBoosters = unique([
    `You already have a point of view; this pack helps you communicate it clearly.`,
    `For ${interviewType.toLowerCase()} interviews, structure matters more than sounding perfect.`,
    `A strong answer is specific, honest, and tied to impact.`,
  ]);

  return {
    meta: {
      title: `${input.seniority ? `${input.seniority} ` : ""}${role}${input.companyName ? ` @ ${input.companyName}` : ""}`.trim(),
      generatedAt: new Date().toISOString(),
      summary: focus,
    },
    input,
    roleSummary,
    researchChecklist,
    likelyQuestions,
    answerGuidance,
    dressCode,
    behaviorTips,
    questionsToAsk,
    prepChecklist,
    confidenceBoosters,
  };
}

function companySpecificNote(company, industry, interviewType) {
  const hasCompany = Boolean(company);
  const industryNote = industry ? ` Because this is in ${industry}, keep one eye on the market and customer expectations.` : "";
  const interviewNote = interviewType === "Technical"
    ? " Technical interviews reward clear reasoning, not just a right answer."
    : interviewType === "Behavioral"
      ? " Behavioral interviews reward concise stories and honest reflection."
      : "";

  if (!hasCompany) {
    return `Keep your prep practical and focused on the role's real day-to-day work.${industryNote}${interviewNote}`;
  }

  return `${company} specific prep should include current product bets, audience, and how the team talks about quality.${industryNote}${interviewNote}`;
}

function dressAdvice(company, industry, interviewType) {
  const lowerIndustry = (industry || "").toLowerCase();
  if (lowerIndustry.includes("finance") || lowerIndustry.includes("law") || lowerIndustry.includes("consult")) {
    return "Choose polished business attire: a clean blazer, simple colors, and minimal accessories. Aim formal rather than trendy.";
  }

  if (lowerIndustry.includes("health") || lowerIndustry.includes("education")) {
    return "Choose smart professional attire that feels calm and trustworthy. Neat, simple, and slightly formal is the safe choice.";
  }

  if (company && /google|meta|shopify|airbnb|spotify|uber|notion|slack/i.test(company)) {
    return "Choose smart casual: clean layers, neutral colors, and one polished detail. You want to look intentional, not overdressed.";
  }

  if (interviewType === "Technical") {
    return "Choose tidy smart casual. You want to look relaxed, capable, and ready to focus on the discussion rather than the outfit.";
  }

  return "Choose smart casual with a polished finish: clean shirt or top, good fit, muted colors, and no distracting details.";
}

function applyPack(pack, input, scroll = true) {
  currentPack = pack;
  currentInput = input;
  setActionButtonsEnabled(true);

  resultsSummary.textContent = `${pack.meta.title} · ${pack.meta.summary}`;
  output.roleSummary.textContent = pack.roleSummary;
  output.researchChecklist.innerHTML = listItems(pack.researchChecklist);
  output.likelyQuestions.innerHTML = pack.likelyQuestions
    .map((item) => `
      <div class="qa-item">
        <strong>${escapeHtml(item.question)}</strong>
        <span><strong>Why they ask:</strong> ${escapeHtml(item.why)}</span>
        <span><strong>How to answer:</strong> ${escapeHtml(item.answer)}</span>
      </div>
    `)
    .join("");
  output.answerGuidance.innerHTML = listItems(pack.answerGuidance);
  output.dressCode.textContent = pack.dressCode;
  output.behaviorTips.innerHTML = listItems(pack.behaviorTips);
  output.questionsToAsk.innerHTML = listItems(pack.questionsToAsk);
  output.prepChecklist.innerHTML = listItems(pack.prepChecklist);
  output.confidenceBoosters.innerHTML = listItems(pack.confidenceBoosters);

  emptyState.classList.add("hidden");
  resultsGrid.classList.remove("hidden");

  if (scroll) {
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setActionButtonsEnabled(enabled) {
  copyBtn.disabled = !enabled;
  downloadBtn.disabled = !enabled;
  saveBtn.disabled = !enabled;
}

function setLoadingState(isLoading, buttonLabel) {
  submitBtn.disabled = isLoading;
  regenerateBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Generating..." : "Generate my prep pack";
  regenerateBtn.textContent = isLoading ? "Working..." : "Regenerate";
  if (isLoading) {
    resultsSummary.textContent = "Building a tailored prep pack with OpenAI...";
  }
  if (!isLoading && buttonLabel === "Regenerate") {
    regenerateBtn.textContent = "Regenerate";
  }
}

function saveCurrentSession(fromButton) {
  if (!currentPack) return;

  const existing = history.findIndex((item) => item.meta.generatedAt === currentPack.meta.generatedAt);
  const snapshot = {
    meta: currentPack.meta,
    input: currentInput,
  };

  if (existing >= 0) {
    history[existing] = snapshot;
  } else {
    history.unshift(snapshot);
  }

  history = history.slice(0, 8);
  persistHistory(history);
  renderHistory();

  if (fromButton) {
    saveBtn.textContent = "Saved";
    setTimeout(() => {
      saveBtn.textContent = "Save session";
    }, 1400);
  }
}

function renderHistory() {
  historyList.innerHTML = "";

  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state" style="margin-top: 0;">
        <div class="empty-icon">IM</div>
        <h3>No saved sessions yet</h3>
        <p>Generate a prep pack and save it here to revisit later.</p>
      </div>
    `;
    return;
  }

  history.forEach((entry) => {
    const node = historyItemTemplate.content.cloneNode(true);
    const button = node.querySelector(".history-item");
    const strong = node.querySelector("strong");
    const span = node.querySelector("span");
    const pill = node.querySelector(".pill");

    strong.textContent = entry.meta.title;
    span.textContent = new Date(entry.meta.generatedAt).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    pill.textContent = entry.input?.interviewType || "Saved";

    button.addEventListener("click", () => {
      const pack = generatePrepPack(entry.input, 0);
      applyPack(pack, entry.input);
    });

    historyList.appendChild(node);
  });
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistHistory(nextHistory) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
  } catch {
    history = nextHistory;
  }
}

function listItems(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function unique(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function toMarkdown(pack) {
  return [
    `# ${pack.meta.title}`,
    ``,
    `Generated: ${new Date(pack.meta.generatedAt).toLocaleString()}`,
    ``,
    `## Role summary`,
    pack.roleSummary,
    ``,
    `## Research checklist`,
    ...pack.researchChecklist.map((item) => `- ${item}`),
    ``,
    `## Likely interview questions`,
    ...pack.likelyQuestions.flatMap((item) => [
      `- ${item.question}`,
      `  - Why they ask: ${item.why}`,
      `  - How to answer: ${item.answer}`,
    ]),
    ``,
    `## How to answer`,
    ...pack.answerGuidance.map((item) => `- ${item}`),
    ``,
    `## Dress advice`,
    pack.dressCode,
    ``,
    `## Behavior and body language`,
    ...pack.behaviorTips.map((item) => `- ${item}`),
    ``,
    `## Questions to ask`,
    ...pack.questionsToAsk.map((item) => `- ${item}`),
    ``,
    `## 24-hour checklist`,
    ...pack.prepChecklist.map((item) => `- ${item}`),
    ``,
    `## Confidence boosters`,
    ...pack.confidenceBoosters.map((item) => `- ${item}`),
    ``,
  ].join("\n");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "prep-pack";
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "true");
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  temp.remove();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
