import { GENERATED_PROTOCOL } from "./generated-protocol";

export type RouteId = "cypherpunk" | "proof" | "builder";

export type TrustShare = {
  x: number;
  y: string;
};

export type RouteCapsule = {
  title: string;
  project: string;
  field: string;
  body: string;
  trace: string;
  share: TrustShare;
};

export type FinalCapsule = {
  level: string;
  title: string;
  body: string;
  frontiers: string[];
  openChannel: string;
  finalLine: string;
};

type EncryptedCapsule = {
  salt?: string;
  iterations?: number;
  iv: string;
  ciphertext: string;
  tag: string;
};

export const PROTOCOL_VERSION = GENERATED_PROTOCOL.protocolVersion;
export const CYPHER_PHRASE = GENERATED_PROTOCOL.cypherPhrase;
export const CYPHER_TOKENS = GENERATED_PROTOCOL.cypherTokens;
export const PROOF_CAPSULE_KEY = GENERATED_PROTOCOL.proofCapsuleKey;
export const BUILDER_OPTIONS = GENERATED_PROTOCOL.builder.options;
export const BUILDER_PROOF = {
  sibling: GENERATED_PROTOCOL.builder.sibling,
  root: GENERATED_PROTOCOL.builder.root,
} as const;

const CAPSULES = GENERATED_PROTOCOL.capsules as Record<RouteId | "final", EncryptedCapsule>;

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toBase64(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function asBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function concat(...values: Uint8Array[]) {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  values.forEach((value) => {
    result.set(value, offset);
    offset += value.length;
  });
  return result;
}

async function sha256(value: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", asBuffer(value)));
}

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function decryptJson<T>(capsule: EncryptedCapsule, key: CryptoKey): Promise<T> {
  const encrypted = concat(fromBase64(capsule.ciphertext), fromBase64(capsule.tag));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(fromBase64(capsule.iv)), tagLength: 128 },
    key,
    asBuffer(encrypted),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function phraseKey(phrase: string, capsule: EncryptedCapsule) {
  if (!capsule.salt || !capsule.iterations) throw new Error("Capsule has no phrase parameters");
  const material = await crypto.subtle.importKey(
    "raw",
    asBuffer(new TextEncoder().encode(phrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asBuffer(fromBase64(capsule.salt)), iterations: capsule.iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

export async function decryptRouteCapsule(route: RouteId, answer: string) {
  const capsule = CAPSULES[route];
  return decryptJson<RouteCapsule>(capsule, await phraseKey(answer, capsule));
}

function gfMultiply(left: number, right: number) {
  let product = 0;
  let a = left;
  let b = right;
  for (let index = 0; index < 8; index += 1) {
    if (b & 1) product ^= a;
    const highBit = a & 0x80;
    a = (a << 1) & 0xff;
    if (highBit) a ^= 0x1b;
    b >>= 1;
  }
  return product;
}

function gfPower(value: number, exponent: number) {
  let result = 1;
  let base = value;
  let power = exponent;
  while (power > 0) {
    if (power & 1) result = gfMultiply(result, base);
    base = gfMultiply(base, base);
    power >>= 1;
  }
  return result;
}

export function reconstructKey(shares: TrustShare[]) {
  if (shares.length < 2) throw new Error("Two trust fragments are required");
  const first = { x: shares[0].x, y: fromBase64(shares[0].y) };
  const second = { x: shares[1].x, y: fromBase64(shares[1].y) };
  const denominator = first.x ^ second.x;
  const inverse = gfPower(denominator, 254);
  return new Uint8Array(first.y.map((value, index) => (
    gfMultiply(value, gfMultiply(second.x, inverse)) ^
    gfMultiply(second.y[index], gfMultiply(first.x, inverse))
  )));
}

export async function decryptFinalCapsule(shares: TrustShare[]) {
  const rawKey = reconstructKey(shares);
  const key = await crypto.subtle.importKey("raw", asBuffer(rawKey), { name: "AES-GCM" }, false, ["decrypt"]);
  return decryptJson<FinalCapsule>(CAPSULES.final, key);
}

export async function verifyBuilderLeaf(candidate: string) {
  const leaf = await sha256(new TextEncoder().encode(candidate));
  const sibling = Uint8Array.from(BUILDER_PROOF.sibling.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  const root = await sha256(concat(leaf, sibling));
  return toHex(root) === BUILDER_PROOF.root;
}

export async function createVisitorSession() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const fingerprint = toHex(await sha256(publicKey)).match(/.{1,4}/g)!.slice(0, 6).join(" ").toUpperCase();
  return { keyPair, fingerprint, publicKey: toBase64(publicKey) };
}

export async function signTranscript(privateKey: CryptoKey, transcript: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(transcript));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, bytes));
  return toBase64(signature);
}
