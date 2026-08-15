import { loadProtocol, hashcashDigest } from "./profile-core.mjs";

const actor = process.argv[2]?.trim();
if (!actor) {
  console.error("Usage: node profile/scripts/mint-hashcash.mjs <github-login>");
  process.exit(1);
}

const { config } = await loadProtocol();
const route = config.routes.hashcash;
const target = "0".repeat(route.difficulty);
let nonce = 0;
let digest = "";

do {
  digest = hashcashDigest(route, actor, nonce);
  nonce += 1;
} while (!digest.startsWith(target));

nonce -= 1;
console.log(`actor:   ${actor.toLowerCase()}`);
console.log(`nonce:   ${nonce}`);
console.log(`digest:  ${digest}`);
console.log(`command: /prove ${nonce}`);
