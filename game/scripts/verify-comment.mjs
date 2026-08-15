import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";

import { groth16 } from "snarkjs";

const POLICY = "1049";

function decodeBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function readReceipt() {
  if (process.argv[2]) {
    return JSON.parse(readFileSync(process.argv[2], "utf8"));
  }
  const comment = process.env.COMMENT_BODY || "";
  const match = comment.match(/^\/verify-zk\s+([A-Za-z0-9_-]+)\s*$/m);
  if (!match) throw new Error("No proof command found");
  return decodeBase64Url(match[1]);
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

try {
  const receipt = readReceipt();
  const publicSignals = receipt.publicSignals;
  const policyMatches =
    Array.isArray(publicSignals) && publicSignals[1] === POLICY && receipt.policy === POLICY;
  const disclosureMatches = Number.isInteger(receipt.disclosedSignals) && receipt.disclosedSignals <= 1;
  const verificationKey = JSON.parse(
    readFileSync(new URL("../public/zk/verification_key.json", import.meta.url), "utf8"),
  );
  const verified =
    policyMatches &&
    disclosureMatches &&
    receipt.protocol === "groth16" &&
    (await groth16.verify(verificationKey, publicSignals, receipt.proof));

  const operatorHex = verified
    ? BigInt(publicSignals[0]).toString(16).padStart(64, "0").toUpperCase()
    : "";
  const operator = verified
    ? `OP-${operatorHex.slice(0, 4)}-${operatorHex.slice(4, 8)}-${operatorHex.slice(8, 12)}`
    : "REJECTED";

  writeOutput("valid", String(verified));
  writeOutput("operator", operator);
  console.log(verified ? `PROOF ACCEPTED / ${operator}` : "PROOF REJECTED");
  process.exit(0);
} catch (error) {
  writeOutput("valid", "false");
  writeOutput("operator", "REJECTED");
  console.error(`PROOF REJECTED / ${error.message}`);
  process.exit(0);
}
