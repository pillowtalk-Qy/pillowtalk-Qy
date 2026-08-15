pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template RedactedArchive() {
    signal input disclosureTimezone;
    signal input disclosureViewport;
    signal input disclosureReferrer;
    signal input operator;
    signal input policy;
    signal output nullifier;

    // Every disclosure choice is a private boolean. The policy is public and
    // only allows one of the three optional local signals to be disclosed.
    disclosureTimezone * (1 - disclosureTimezone) === 0;
    disclosureViewport * (1 - disclosureViewport) === 0;
    disclosureReferrer * (1 - disclosureReferrer) === 0;

    signal totalDisclosure;
    totalDisclosure <== disclosureTimezone + disclosureViewport + disclosureReferrer;
    totalDisclosure * (totalDisclosure - 1) === 0;
    policy === 1049;

    component identity = Poseidon(4);
    identity.inputs[0] <== disclosureTimezone;
    identity.inputs[1] <== disclosureViewport;
    identity.inputs[2] <== disclosureReferrer;
    identity.inputs[3] <== operator;
    nullifier <== identity.out;
}

component main { public [policy] } = RedactedArchive();
