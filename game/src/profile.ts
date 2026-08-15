export type Claim = {
  id: string;
  index: string;
  statement: string;
  evidence: string;
  scope: string;
  signature: string;
};

export type Heartbeat = {
  sha: string;
  at: string;
  mode: "demo" | "signed";
};

export const PROFILE = {
  codename: "Qy // NULL SELF",
  protocol: "PROTOCOL OF ACQUAINTANCE / 1.0",
  publicKey: "MCowBQYDK2VwAyEAQyPJgRgpTNpql9GRL1dUZdrpR+JefAObxMpqPYvNyTk=",
  heartbeat: {
    sha: "7a1f0e3",
    at: "2026-08-15T03:17:00+08:00",
    mode: "demo",
  } satisfies Heartbeat,
  claims: [
    {
      id: "CLAIM-01",
      index: "01",
      statement: "I build machine intelligence that can forget.",
      evidence: "AI / PRIVATE INFERENCE / AGENT SYSTEMS",
      scope: "OWNER-ATTESTED / SCOPE LIMITED",
      signature: "x0kM1fjjc68J2Oa5eM4ohxo43rs/QO40kiTjeT8e6BUZXYhxOUsvOtogCQ4PMPB/+QCyyrUlXe6TWTdeCWHpAA==",
    },
    {
      id: "CLAIM-02",
      index: "02",
      statement: "I build with cryptography, not promises.",
      evidence: "ZERO KNOWLEDGE / APPLIED CRYPTO / PROTOCOLS",
      scope: "OWNER-ATTESTED / SCOPE LIMITED",
      signature: "q6j/I4bzWWy3ETh3HHmnN03tVZyiVjX+6imlIJpFPkKx8pSEIgO9PAhjhbD6nIip7BHHPoiA7jApHcleqQGqBA==",
    },
    {
      id: "CLAIM-03",
      index: "03",
      statement: "I build for the right to exit.",
      evidence: "PERMISSIONLESS INFRASTRUCTURE / SELF CUSTODY / CENSORSHIP RESISTANCE",
      scope: "OWNER-ATTESTED / SCOPE LIMITED",
      signature: "CZoDcdjlU15hwrI9uMT5tp4DBIoUPqhGnhdl0NROFyGt0joQUMZMqACa3nT+i8BBd240zMEv1g/l2afftAN+Dg==",
    },
  ] satisfies Claim[],
} as const;

export const POLICY = "1049";
