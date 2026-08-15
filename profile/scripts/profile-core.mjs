import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export const CONFIG_PATH = path.join(REPO_ROOT, "profile/challenges.json");
export const STATE_PATH = path.join(REPO_ROOT, "profile/state.json");
export const README_PATH = path.join(REPO_ROOT, "README.md");
export const SVG_PATH = path.join(REPO_ROOT, "assets/proof-window.svg");

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function loadProtocol() {
  const [config, state] = await Promise.all([
    readJson(CONFIG_PATH),
    readJson(STATE_PATH),
  ]);
  return { config, state };
}

export function parseIssueBody(body = "") {
  const fields = Object.fromEntries(
    body
      .split(/\r?\n/)
      .map((line) => line.match(/^([a-z-]+):\s*(.*?)\s*$/i))
      .filter(Boolean)
      .map((match) => [match[1].toLowerCase(), match[2]]),
  );
  return {
    route: fields.route || "",
    proof: fields.proof || "",
  };
}

export function parseProofComment(body = "") {
  const match = body.trim().match(/^\/prove\s+([^\s]+)\s*$/i);
  return match ? match[1] : "";
}

export function makeNullifier(config, actor, routeId) {
  return sha256(
    `${config.nullifierDomain}::${actor.toLowerCase()}::${routeId}`,
  ).slice(0, 16);
}

export function hashcashDigest(route, actor, nonce) {
  return sha256(
    `${route.domain}::${actor.toLowerCase()}::${String(nonce)}`,
  );
}

export async function verifyRoute({ config, routeId, actor, proof }) {
  const route = config.routes[routeId];
  if (!route) {
    return { valid: false, reason: "UNKNOWN ROUTE" };
  }

  if (route.kind === "ed25519") {
    const publicKey = createPublicKey({
      key: Buffer.from(route.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    const valid = verifySignature(
      null,
      Buffer.from(route.message),
      publicKey,
      Buffer.from(route.signature, "base64"),
    );
    return {
      valid,
      reason: valid ? "ED25519 SIGNATURE VALID" : "SIGNATURE INVALID",
      evidence: sha256(route.message).slice(0, 16),
    };
  }

  if (route.kind === "sha256") {
    const file = await readFile(path.join(REPO_ROOT, route.path));
    const digest = sha256(file);
    return {
      valid: digest === route.expectedHash,
      reason:
        digest === route.expectedHash
          ? "SHA-256 ARTIFACT MATCH"
          : "ARTIFACT DIGEST MISMATCH",
      evidence: digest.slice(0, 16),
    };
  }

  if (route.kind === "hashcash") {
    if (!/^[0-9]{1,20}$/.test(String(proof))) {
      return { valid: false, reason: "NONCE REQUIRED" };
    }
    const digest = hashcashDigest(route, actor, proof);
    const target = "0".repeat(route.difficulty);
    return {
      valid: digest.startsWith(target),
      reason: digest.startsWith(target)
        ? `${route.difficulty * 4}-BIT HASHCASH ACCEPTED`
        : `DIGEST MUST BEGIN ${target}`,
      evidence: digest.slice(0, 16),
    };
  }

  return { valid: false, reason: "UNSUPPORTED VERIFIER" };
}

export function applyValidProof({ config, state, routeId, actor, evidence, now }) {
  const routeState = state.routes[routeId];
  const nullifier = makeNullifier(config, actor, routeId);

  if (routeState.nullifiers.includes(nullifier)) {
    return { changed: false, nullifier, duplicate: true };
  }

  routeState.nullifiers.push(nullifier);
  routeState.proofs += 1;
  routeState.unlocked = true;
  state.totalProofs += 1;
  state.revision += 1;
  state.dossierUnlocked =
    Object.values(state.routes).filter((route) => route.unlocked).length >= 2;
  state.events.unshift({
    route: routeId,
    nullifier,
    evidence,
    at: now || new Date().toISOString(),
  });
  state.events = state.events.slice(0, 6);

  return { changed: true, nullifier, duplicate: false };
}

const xml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const routeStatus = (routeState) =>
  routeState.unlocked ? "VERIFIED" : "SEALED";

export function renderSvg(config, state) {
  const routes = Object.entries(config.routes);
  const unlocked = routes.filter(([id]) => state.routes[id].unlocked).length;
  const panels = routes
    .map(([id, route], index) => {
      const x = 48 + index * 382;
      const routeState = state.routes[id];
      const verified = routeState.unlocked;
      const accent = verified ? "#7fffd1" : index === 0 ? "#a767ff" : index === 1 ? "#66e3e8" : "#6cbbff";
      const status = routeStatus(routeState);
      const capsule = verified ? route.capsule.name : "ENCRYPTED CAPSULE";
      const evidence = state.events.find((event) => event.route === id)?.evidence || "----------------";
      return `
  <g transform="translate(${x} 164)">
    <rect width="350" height="224" fill="#0b0b11" stroke="#30333f"/>
    <path d="M0 0H350M0 0V224" stroke="${accent}" stroke-width="2"/>
    <text x="20" y="30" class="micro" fill="${accent}">VECTOR ${xml(route.index)} // ${xml(route.grade)}</text>
    <text x="20" y="65" class="panel-title">${xml(route.label)}</text>
    <text x="20" y="95" class="label">VERIFIER</text>
    <text x="330" y="95" class="value" text-anchor="end">${xml(route.kind.toUpperCase())}</text>
    <text x="20" y="123" class="label">STATE</text>
    <text x="330" y="123" class="value" text-anchor="end" fill="${accent}">${status}</text>
    <text x="20" y="151" class="label">PROOFS</text>
    <text x="330" y="151" class="value" text-anchor="end">${routeState.proofs}</text>
    <line x1="20" x2="330" y1="170" y2="170" stroke="#30333f"/>
    <text x="20" y="194" class="capsule" fill="${verified ? "#f3f4f7" : "#6f7380"}">${xml(capsule)}</text>
    <text x="20" y="214" class="digest">EVIDENCE ${xml(evidence)}</text>
  </g>`;
    })
    .join("");

  const latest = state.events[0];
  const eventLine = latest
    ? `${latest.nullifier} / ${config.routes[latest.route].label} / ACCEPTED`
    : "AWAITING FIRST VISITOR PROOF";
  const dossier = state.dossierUnlocked
    ? "DOSSIER OPEN // TRUST THRESHOLD SATISFIED"
    : `DOSSIER SEALED // ${unlocked}/2 DISTINCT VECTORS`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500" role="img" aria-labelledby="title desc">
  <title id="title">Qy Proof of Acquaintance</title>
  <desc id="desc">A shared cryptographic profile state with three proof vectors.</desc>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 0; }
    .eyebrow { font-size: 13px; font-weight: 700; }
    .title { font-size: 31px; font-weight: 700; fill: #f3f4f7; }
    .counter { font-size: 13px; fill: #a4a8b3; }
    .micro { font-size: 11px; font-weight: 700; }
    .panel-title { font-size: 18px; font-weight: 700; fill: #f3f4f7; }
    .label { font-size: 11px; fill: #777c89; }
    .value { font-size: 11px; fill: #d6d8df; }
    .capsule { font-size: 13px; font-weight: 700; }
    .digest { font-size: 10px; fill: #777c89; }
    .ticker { font-size: 11px; fill: #b8bbc4; }
    .blink { animation: blink 1.8s steps(2, end) infinite; }
    @keyframes blink { 50% { opacity: .3; } }
  </style>
  <rect width="1200" height="500" fill="#070709"/>
  <path d="M0 102H1200M0 428H1200" stroke="#242631"/>
  <path d="M28 0V500M1172 0V500" stroke="#171821"/>
  <path d="M28 132H1172M28 404H1172" stroke="#14151d" stroke-dasharray="3 7"/>
  <text x="48" y="43" class="eyebrow" fill="#a767ff">Qy // PUBLIC CRYPTOGRAPHIC INTERFACE</text>
  <text x="48" y="80" class="title">PROOF OF ACQUAINTANCE</text>
  <text x="1152" y="43" class="counter" text-anchor="end">REV ${String(state.revision).padStart(4, "0")} / ${state.totalProofs} PROOFS</text>
  <text x="1152" y="80" class="counter" text-anchor="end" fill="${state.dossierUnlocked ? "#7fffd1" : "#6cbbff"}">${xml(dossier)}</text>
  <circle cx="34" cy="43" r="3" fill="#66e3e8" class="blink"/>
  ${panels}
  <text x="48" y="460" class="ticker" fill="#66e3e8">LATEST //</text>
  <text x="126" y="460" class="ticker">${xml(eventLine)}</text>
  <text x="1152" y="460" class="ticker" text-anchor="end">PSEUDONYMOUS / PUBLIC GITHUB EVENTS</text>
  <path d="M48 478H260" stroke="#a767ff" stroke-width="2"/><path d="M260 478H1152" stroke="#242631"/>
</svg>
`;
}

function issueUrl(repository, route) {
  const title = `[Qy-PROOF] ${route.index} / ${route.label}`;
  const body = `route: ${route.id}\nproof: ${route.kind === "hashcash" ? "REQUEST_CHALLENGE" : "trigger"}`;
  return `https://github.com/${repository}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

function statusCell(route, routeState) {
  if (!routeState.unlocked) return "`SEALED`";
  return `[\`${route.capsule.name}\`](${route.capsule.url})`;
}

export function renderReadmeBlock(config, state) {
  const routes = Object.entries(config.routes).map(([id, route]) => ({
    ...route,
    id,
  }));
  const rows = routes
    .map((route) => {
      const stateForRoute = state.routes[route.id];
      const action = stateForRoute.unlocked ? "REPLAY PROOF" : "SUBMIT PROOF";
      return `| \`${route.index}\` | ${route.label} | ${statusCell(route, stateForRoute)} | [${action}](${issueUrl(config.repository, route)}) |`;
    })
    .join("\n");
  const unlocked = routes.filter((route) => state.routes[route.id].unlocked).length;
  const events = state.events.length
    ? state.events
        .slice(0, 4)
        .map(
          (event) =>
            `\`${event.nullifier}\` / ${config.routes[event.route].label} / \`${event.evidence}\``,
        )
        .join("  \n")
    : "`NO ACCEPTED PROOFS YET`";
  const dossier = state.dossierUnlocked
    ? "`OPEN` - two independent proof vectors have been accepted."
    : `\`SEALED\` - ${unlocked}/2 proof vectors accepted.`;

  const hashcash = routes.find((route) => route.kind === "hashcash");
  return `<p align="center">
  <img src="./assets/proof-window.svg?rev=${state.revision}" width="100%" alt="Qy Proof of Acquaintance shared cryptographic state">
</p>

> **This is a shared protocol.** Every accepted proof changes this public README for the next visitor. GitHub identities remain public; displayed nullifiers are pseudonymous, not anonymous.

| VECTOR | VERIFIER | REVEALED CAPSULE | INPUT |
| :--- | :--- | :--- | :--- |
${rows}

<details>
<summary><b>HOW VECTOR ${hashcash.index} WORKS</b></summary>

1. Open **SUBMIT PROOF**. The bot binds a challenge to your GitHub username.
2. Follow its **OPEN HASHCASH MINTER** link and press **MINT PROOF**.
3. Paste the generated \`/prove nonce\` command into the same Issue.

The verifier recomputes \`SHA-256(${hashcash.domain}::your-github-login::nonce)\` and accepts only a digest beginning with \`${"0".repeat(hashcash.difficulty)}\`.

</details>

**DOSSIER:** ${dossier}

**RECENT NULLIFIERS**  
${events}

[\`ENTER THE FULL EVIDENCE OBSERVATORY ->\`](https://pillowtalk-Qy.github.io/pillowtalk-Qy/)`;
}

export async function renderProtocol(config, state) {
  const [readme] = await Promise.all([
    readFile(README_PATH, "utf8"),
    writeFile(SVG_PATH, renderSvg(config, state)),
  ]);
  const start = "<!-- PROFILE-PROTOCOL:START -->";
  const end = "<!-- PROFILE-PROTOCOL:END -->";
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README protocol markers are missing or malformed");
  }
  const updated = `${readme.slice(0, startIndex + start.length)}\n${renderReadmeBlock(config, state)}\n${readme.slice(endIndex)}`;
  await writeFile(README_PATH, updated);
}
