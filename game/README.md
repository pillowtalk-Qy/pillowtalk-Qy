# Qy // NULL SELF: Cryptographic Evidence Observatory

A full-screen GitHub Pages profile where an anonymous visitor connects evidence objects to public claims, verifies their exact scope, and decrypts project capsules. The Three.js portrait becomes more legible as valid evidence accumulates.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Visitor flow

1. Generate a non-extractable, ephemeral P-256 visitor key. Nothing is persisted.
2. Drag an evidence object to a claim, or tap the evidence and then the claim.
3. The browser checks both cryptographic validity and scope. A valid object connected to the wrong claim is rejected.
4. Verified evidence decrypts project capsules and releases 2-of-3 Shamir fragments.
5. Any two fragments reconstruct the final AES key and open the deeper dossier.
6. The ephemeral visitor key signs a downloadable local evidence receipt.

## Evidence grades

| Grade | What it establishes | What it does not establish |
| --- | --- | --- |
| `SELF-ATTESTED` | The embedded Ed25519 owner key authorized the statement. | That the statement is externally true. |
| `PUBLIC ARTIFACT` | A deployed file matches its declared SHA-256 digest. | Authorship or production use by itself. |
| `DEMO COMMITMENT` | A project leaf belongs to this profile's Merkle commitment. | An external repository or deployment exists. |
| `LOCAL PROOF` | A browser-generated Groth16 proof satisfies policy `1049`. | Any fact about the owner's biography. |
| `SOURCE MISSING` | No configured source can resolve the claim. | Nothing; the claim remains unresolved. |

The included data is deliberately labeled `DEMO SOURCES / REPLACE BEFORE DEPLOYMENT` until real repositories, signed releases, deployments, or chain records are configured.

## Customize encrypted content

Edit `protocol/protocol.content.json`, then regenerate every capsule and key:

```bash
npm run protocol:generate
npm run build
```

The generator creates fresh AES keys, salts, IVs, Merkle material, and Shamir shares in `src/generated-protocol.ts`. Commit the generated file with the content change.

## GitHub integration

`.github/workflows/deploy-pages.yml` deploys the Vite build. `.github/workflows/update-heartbeat.yml` refreshes the public heartbeat after GitHub reports a source commit as verified. `.github/workflows/verify-proof.yml` can independently check a `/verify-zk ...` proof receipt in Issue comments.

## Security boundary

This static edition uses real cryptographic operations, but it is interactive public art rather than access control. A determined visitor can inspect the shipped JavaScript or brute-force low-entropy answers. Never place secrets, private keys, unreleased credentials, or sensitive personal information in its capsules.

For actual gated disclosure, issue encrypted shares from a rate-limited backend and keep release keys outside the Pages bundle. The final dossier can still decrypt locally without identifying the visitor.
