# NULL//SELF minimal-disclosure circuit

The circuit proves three statements:

1. Each private disclosure choice is Boolean.
2. The total number of disclosed signals is zero or one.
3. The private choices and operator seed are bound to a public Poseidon `nullifier` under policy `1049`.

The choices and operator seed never appear in the public signals. The browser exports only the policy identifier, nullifier, and proof.

The bundled Groth16 parameters are generated for this interactive prototype. A production or security-critical fork must use an independently verifiable multi-party ceremony or a proving system with setup assumptions appropriate to the deployment.
