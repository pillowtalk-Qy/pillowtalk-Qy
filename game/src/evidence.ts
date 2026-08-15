export type ClaimId = "claim-ai" | "claim-crypto" | "claim-exit";
export type EvidenceId = "sig-ai" | "sig-crypto" | "sig-exit" | "manifest-ai" | "artifact-circuit" | "local-zk" | "external-exit";
export type EvidenceGrade = "SELF-ATTESTED" | "PUBLIC ARTIFACT" | "DEMO COMMITMENT" | "LOCAL PROOF" | "SOURCE MISSING";
export type EvidenceVerifier = "signature" | "artifact" | "merkle" | "zk" | "missing";

export type ClaimNode = {
  id: ClaimId;
  index: number;
  label: string;
  short: string;
  x: number;
  y: number;
  mobileX: number;
  mobileY: number;
};

export type EvidenceNode = {
  id: EvidenceId;
  target: ClaimId;
  label: string;
  short: string;
  grade: EvidenceGrade;
  verifier: EvidenceVerifier;
  source: string;
  scope: string;
  x: number;
  y: number;
  mobileX: number;
  mobileY: number;
  claimIndex?: number;
  artifactUrl?: string;
  expectedHash?: string;
};

export const CLAIM_NODES: ClaimNode[] = [
  { id: "claim-ai", index: 0, label: "MACHINE INTELLIGENCE THAT CAN FORGET", short: "PRIVATE AI", x: 69, y: 24, mobileX: 69, mobileY: 22 },
  { id: "claim-crypto", index: 1, label: "CRYPTOGRAPHY, NOT PROMISES", short: "APPLIED CRYPTO", x: 72, y: 51, mobileX: 73, mobileY: 49 },
  { id: "claim-exit", index: 2, label: "THE RIGHT TO EXIT", short: "EXIT RIGHTS", x: 68, y: 78, mobileX: 67, mobileY: 76 },
];

export const EVIDENCE_NODES: EvidenceNode[] = [
  {
    id: "sig-ai", target: "claim-ai", label: "OWNER SIGNATURE / CLAIM 01", short: "SIG 01", grade: "SELF-ATTESTED", verifier: "signature",
    source: "Embedded Ed25519 owner key", scope: "Proves who authorized the words. Does not prove the project exists.", claimIndex: 0,
    x: 16, y: 16, mobileX: 16, mobileY: 14,
  },
  {
    id: "sig-crypto", target: "claim-crypto", label: "OWNER SIGNATURE / CLAIM 02", short: "SIG 02", grade: "SELF-ATTESTED", verifier: "signature",
    source: "Embedded Ed25519 owner key", scope: "Authenticates the statement only. Technical evidence is separate.", claimIndex: 1,
    x: 12, y: 38, mobileX: 14, mobileY: 39,
  },
  {
    id: "sig-exit", target: "claim-exit", label: "OWNER SIGNATURE / CLAIM 03", short: "SIG 03", grade: "SELF-ATTESTED", verifier: "signature",
    source: "Embedded Ed25519 owner key", scope: "Authenticates a value statement. It is not external corroboration.", claimIndex: 2,
    x: 17, y: 72, mobileX: 15, mobileY: 73,
  },
  {
    id: "manifest-ai", target: "claim-ai", label: "PROJECT LEAF / PRIVATE AGENT", short: "MERKLE", grade: "DEMO COMMITMENT", verifier: "merkle",
    source: "Locally generated project manifest", scope: "Verifies inclusion in this profile's commitment. Replace with a real repository artifact.",
    x: 35, y: 82, mobileX: 38, mobileY: 86,
  },
  {
    id: "artifact-circuit", target: "claim-crypto", label: "CIRCOM SOURCE / SHA-256", short: "CIRCUIT", grade: "PUBLIC ARTIFACT", verifier: "artifact",
    source: "public/evidence/redacted_archive.circom", scope: "Verifies the deployed circuit source byte-for-byte. It does not prove authorship by itself.",
    artifactUrl: "evidence/redacted_archive.circom", expectedHash: "425d81857a785f732367c11ba1c68f5fabfaaf77e0081070a08c1a627ae03e7d",
    x: 34, y: 57, mobileX: 37, mobileY: 60,
  },
  {
    id: "local-zk", target: "claim-crypto", label: "SESSION PROOF / POLICY 1049", short: "GROTH16", grade: "LOCAL PROOF", verifier: "zk",
    source: "Browser-generated Groth16 proof", scope: "Proves this visitor disclosed at most one optional local signal. It proves no biographical claim.",
    x: 31, y: 29, mobileX: 40, mobileY: 31,
  },
  {
    id: "external-exit", target: "claim-exit", label: "EXTERNAL PROJECT SOURCE", short: "MISSING", grade: "SOURCE MISSING", verifier: "missing",
    source: "No GitHub repository, signed release, deployment, or chain record configured", scope: "The claim remains self-attested until an external source is attached.",
    x: 42, y: 12, mobileX: 43, mobileY: 8,
  },
];
