import * as snarkjs from "snarkjs";

const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type ProofReceipt = {
  protocol: "groth16";
  curve: "bn128";
  proof: Record<string, unknown>;
  publicSignals: string[];
  generatedAt: string;
  policy: string;
  disclosedSignals: number;
};

export async function hashToField(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return (BigInt(`0x${hex}`) % FIELD_PRIME).toString();
}

export async function generateAndVerifyProof(input: {
  disclosureTimezone: string;
  disclosureViewport: string;
  disclosureReferrer: string;
  operator: string;
  policy: string;
}): Promise<{ receipt: ProofReceipt; verified: boolean }> {
  const base = import.meta.env.BASE_URL;
  const wasmUrl = `${base}zk/redacted_archive.wasm`;
  const zkeyUrl = `${base}zk/redacted_archive_final.zkey`;
  const verificationKeyUrl = `${base}zk/verification_key.json`;

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmUrl,
    zkeyUrl,
  );
  const verificationKey = await fetch(verificationKeyUrl).then((response) => {
    if (!response.ok) throw new Error("Verification key unavailable");
    return response.json();
  });
  const verified = await snarkjs.groth16.verify(
    verificationKey,
    publicSignals,
    proof,
  );

  return {
    verified,
    receipt: {
      protocol: "groth16",
      curve: "bn128",
      proof,
      publicSignals,
      generatedAt: new Date().toISOString(),
      policy: input.policy,
      disclosedSignals:
        Number(input.disclosureTimezone) +
        Number(input.disclosureViewport) +
        Number(input.disclosureReferrer),
    },
  };
}

export function encodeDeadDrop(receipt: ProofReceipt): string {
  const bytes = new TextEncoder().encode(JSON.stringify(receipt));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
