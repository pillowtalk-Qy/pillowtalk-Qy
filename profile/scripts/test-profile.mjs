import assert from "node:assert/strict";
import {
  applyValidProof,
  hashcashDigest,
  loadProtocol,
  parseIssueBody,
  parseProofComment,
  renderReadmeBlock,
  renderSvg,
  verifyRoute,
} from "./profile-core.mjs";

const { config, state } = await loadProtocol();
const actor = "profile-tester";

assert.deepEqual(parseIssueBody("route: hashcash\nproof: 42"), {
  route: "hashcash",
  proof: "42",
});
assert.equal(parseProofComment("/prove 42"), "42");
assert.equal(parseProofComment("not a proof"), "");

const signature = await verifyRoute({
  config,
  routeId: "owner-signature",
  actor,
  proof: "trigger",
});
assert.equal(signature.valid, true);

const artifact = await verifyRoute({
  config,
  routeId: "artifact-hash",
  actor,
  proof: "trigger",
});
assert.equal(artifact.valid, true);

const hashcashRoute = config.routes.hashcash;
const target = "0".repeat(hashcashRoute.difficulty);
let nonce = 0;
while (!hashcashDigest(hashcashRoute, actor, nonce).startsWith(target)) nonce += 1;

const hashcash = await verifyRoute({
  config,
  routeId: "hashcash",
  actor,
  proof: String(nonce),
});
assert.equal(hashcash.valid, true);
assert.equal(
  (
    await verifyRoute({
      config,
      routeId: "hashcash",
      actor: "someone-else",
      proof: String(nonce),
    })
  ).valid,
  false,
);

const testState = structuredClone(state);
const first = applyValidProof({
  config,
  state: testState,
  routeId: "owner-signature",
  actor,
  evidence: signature.evidence,
  now: "2026-08-15T00:00:00.000Z",
});
assert.equal(first.changed, true);
assert.equal(
  applyValidProof({
    config,
    state: testState,
    routeId: "owner-signature",
    actor,
    evidence: signature.evidence,
  }).duplicate,
  true,
);
applyValidProof({
  config,
  state: testState,
  routeId: "artifact-hash",
  actor: "second-tester",
  evidence: artifact.evidence,
});
assert.equal(testState.dossierUnlocked, true);
assert.match(renderSvg(config, testState), /DOSSIER OPEN/);
assert.match(renderReadmeBlock(config, testState), /RECENT NULLIFIERS/);

console.log(
  `Profile protocol tests passed; visitor nonce ${nonce} -> ${hashcash.evidence}.`,
);
