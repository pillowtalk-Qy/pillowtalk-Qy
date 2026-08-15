import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  REPO_ROOT,
  STATE_PATH,
  applyValidProof,
  loadProtocol,
  parseIssueBody,
  parseProofComment,
  renderProtocol,
  verifyRoute,
  writeJson,
} from "./profile-core.mjs";

const resultPath = path.join(REPO_ROOT, "profile/.proof-result.json");
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!eventPath) {
  throw new Error("GITHUB_EVENT_PATH is required; use test-profile.mjs for local checks");
}

const event = JSON.parse(await readFile(eventPath, "utf8"));
const { config, state } = await loadProtocol();
const issue = event.issue;
const actor = event.comment?.user?.login || event.sender?.login || issue?.user?.login;

if (!issue?.title?.startsWith("[Qy-PROOF]") || !actor) {
  throw new Error("Event is not a Qy proof request");
}

const request = parseIssueBody(issue.body || "");
const routeId = request.route;
const route = config.routes[routeId];
const proof = event.comment
  ? parseProofComment(event.comment.body || "")
  : request.proof;

let result;

if (!route) {
  result = {
    valid: false,
    changed: false,
    close: false,
    status: "rejected",
    body: "```text\nQy // PROOF REJECTED\nUNKNOWN PROOF VECTOR\n```",
  };
} else if (
  route.kind === "hashcash" &&
  (!proof || proof === "REQUEST_CHALLENGE")
) {
  const minter = new URL("https://pillowtalk-Qy.github.io/pillowtalk-Qy/mint.html");
  minter.searchParams.set("actor", actor);
  minter.searchParams.set("issue", String(issue.number));
  result = {
    valid: false,
    changed: false,
    close: false,
    status: "needs_proof",
    route: routeId,
    body: `\`\`\`text
Qy // HASHCASH CHALLENGE ISSUED
SUBJECT  @${actor}
TARGET   SHA-256 digest begins ${"0".repeat(route.difficulty)}
BINDING  ${route.domain}::${actor.toLowerCase()}::nonce
\`\`\`

[**OPEN HASHCASH MINTER ->**](${minter.toString()})

Mint the proof, then paste the generated \`/prove nonce\` command into this Issue. The challenge is bound to your GitHub login and cannot be replayed by another account.`,
  };
} else {
  const verification = await verifyRoute({
    config,
    routeId,
    actor,
    proof,
  });

  if (!verification.valid) {
    result = {
      valid: false,
      changed: false,
      close: false,
      status: "rejected",
      route: routeId,
      body: `\`\`\`text
Qy // PROOF REJECTED
VECTOR   ${route.index} / ${route.label}
REASON   ${verification.reason}
\`\`\`

The shared profile state was not changed.${route.kind === "hashcash" ? " Reopen the personalized minter link and try again." : ""}`,
    };
  } else {
    const applied = applyValidProof({
      config,
      state,
      routeId,
      actor,
      evidence: verification.evidence,
    });

    if (applied.changed && process.env.PROFILE_DRY_RUN !== "1") {
      await writeJson(STATE_PATH, state);
      await renderProtocol(config, state);
    }

    result = {
      valid: true,
      changed: applied.changed,
      close: true,
      status: applied.duplicate ? "duplicate" : "accepted",
      route: routeId,
      nullifier: applied.nullifier,
      body: `\`\`\`text
Qy // ${applied.duplicate ? "PROOF ALREADY RECORDED" : "PROOF ACCEPTED"}
VECTOR      ${route.index} / ${route.label}
VERIFIER    ${verification.reason}
NULLIFIER   ${applied.nullifier}
PROFILE     ${applied.changed ? `REVISION ${state.revision}` : "UNCHANGED"}
\`\`\`

${applied.changed ? `Capsule **[${route.capsule.name}](${route.capsule.url})** is now visible on the shared profile.` : "This GitHub identity has already satisfied this vector."}`,
    };
  }
}

await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    `valid=${result.valid}\nchanged=${result.changed}\nstatus=${result.status}\n`,
    { flag: "a" },
  );
}

console.log(JSON.stringify(result));
