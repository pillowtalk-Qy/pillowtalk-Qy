import {
  Download,
  Fingerprint,
  ShieldCheck,
  Unlock,
  X,
  createIcons,
} from "lucide";

import "./styles.css";
import { CLAIM_NODES, EVIDENCE_NODES, type ClaimId, type EvidenceId, type EvidenceNode } from "./evidence";
import { PROFILE, POLICY, type Claim } from "./profile";
import {
  BUILDER_OPTIONS,
  CYPHER_PHRASE,
  PROOF_CAPSULE_KEY,
  PROTOCOL_VERSION,
  createVisitorSession,
  decryptFinalCapsule,
  decryptRouteCapsule,
  signTranscript,
  verifyBuilderLeaf,
  type FinalCapsule,
  type RouteCapsule,
  type RouteId,
} from "./protocol";
import { createEvidenceScene, type EvidenceScene } from "./scene";
import type { ProofReceipt } from "./zk";

type DisclosureKey = "timezone" | "viewport" | "referrer";
type VisitorSession = Awaited<ReturnType<typeof createVisitorSession>>;
type ConnectionStatus = "verified" | "unresolved";
type Connection = { evidence: EvidenceId; claim: ClaimId; status: ConnectionStatus; digest?: string };

const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const query = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const queryAll = <T extends Element>(selector: string) => Array.from(document.querySelectorAll<T>(selector));

const elements = {
  shell: query<HTMLElement>(".app-shell"),
  observatory: query<HTMLElement>("#observatory"),
  canvas: query<HTMLCanvasElement>("#evidence-canvas"),
  connections: query<SVGSVGElement>("#connection-layer"),
  entryGate: query<HTMLElement>("#entry-gate"),
  beginSession: query<HTMLButtonElement>("#begin-session"),
  claimLayer: query<HTMLElement>("#claim-layer"),
  evidenceLayer: query<HTMLElement>("#evidence-layer"),
  projectLayer: query<HTMLElement>("#project-layer"),
  sessionState: query<HTMLElement>("#session-state"),
  sessionFragments: query<HTMLElement>("#session-fragments"),
  sessionFingerprint: query<HTMLElement>("#session-fingerprint"),
  fieldCommand: query<HTMLElement>("#field-command"),
  claimResolution: query<HTMLElement>("#claim-resolution"),
  inspector: query<HTMLElement>("#evidence-inspector"),
  inspectorEmpty: query<HTMLElement>("#inspector-empty"),
  inspectorContent: query<HTMLElement>("#inspector-content"),
  inspectorGrade: query<HTMLElement>("#inspector-grade"),
  inspectorId: query<HTMLElement>("#inspector-id"),
  inspectorTitle: query<HTMLElement>("#inspector-title"),
  inspectorSource: query<HTMLElement>("#inspector-source"),
  inspectorScope: query<HTMLElement>("#inspector-scope"),
  inspectorTarget: query<HTMLElement>("#inspector-target"),
  inspectorResult: query<HTMLElement>("#inspector-result"),
  inspectorDigest: query<HTMLElement>("#inspector-digest"),
  closeInspector: query<HTMLButtonElement>("#close-inspector"),
  vaultTrigger: query<HTMLButtonElement>("#vault-trigger"),
  projectDialog: query<HTMLDialogElement>("#project-dialog"),
  projectField: query<HTMLElement>("#project-field"),
  projectGrade: query<HTMLElement>("#project-grade"),
  projectTitle: query<HTMLElement>("#project-title"),
  projectBody: query<HTMLElement>("#project-body"),
  projectEvidenceChain: query<HTMLElement>("#project-evidence-chain"),
  projectName: query<HTMLElement>("#project-name"),
  projectTrace: query<HTMLElement>("#project-trace"),
  zkDialog: query<HTMLDialogElement>("#zk-dialog"),
  disclosureCount: query<HTMLElement>("#disclosure-count"),
  proofStatus: query<HTMLElement>("#proof-status"),
  proofNullifier: query<HTMLElement>("#proof-nullifier"),
  generateProof: query<HTMLButtonElement>("#generate-proof"),
  finalDialog: query<HTMLDialogElement>("#final-dialog"),
  finalLevel: query<HTMLElement>("#final-level"),
  finalSession: query<HTMLElement>("#final-session"),
  finalTitle: query<HTMLElement>("#final-title"),
  finalBody: query<HTMLElement>("#final-body"),
  frontierList: query<HTMLElement>("#frontier-list"),
  finalChannel: query<HTMLElement>("#final-channel"),
  finalLine: query<HTMLElement>("#final-line"),
  sessionSignature: query<HTMLElement>("#session-signature"),
  downloadSession: query<HTMLButtonElement>("#download-session"),
  alerts: query<HTMLElement>("#alerts"),
};

const disclosure: Record<DisclosureKey, boolean> = { timezone: false, viewport: false, referrer: false };
const connections = new Map<EvidenceId, Connection>();
const projects = new Map<RouteId, { capsule: RouteCapsule; grade: string; evidence: EvidenceId[] }>();
let visitorSession: VisitorSession | undefined;
let selectedEvidence: EvidenceId | undefined;
let pendingZkTarget: ClaimId | undefined;
let proofReceipt: ProofReceipt | undefined;
let finalCapsule: FinalCapsule | undefined;
let sessionReceipt: Record<string, unknown> | undefined;
let alertTimer: number | undefined;
let dragState: { id: EvidenceId; startX: number; startY: number; dragged: boolean } | undefined;
let suppressClick = false;

createIcons({
  icons: { Download, Fingerprint, ShieldCheck, Unlock, X },
  attrs: { width: 16, height: 16, "stroke-width": 1.8 },
});

const scene = createEvidenceScene(elements.canvas, `${import.meta.env.BASE_URL}assets/intercepted-identity.jpg`);
(window as Window & { __evidenceScene?: EvidenceScene }).__evidenceScene = scene;

function announce(message: string, kind: "neutral" | "success" | "error" = "neutral") {
  elements.alerts.textContent = message;
  elements.alerts.dataset.kind = kind;
  elements.alerts.hidden = false;
  elements.alerts.dataset.visible = "true";
  window.clearTimeout(alertTimer);
  alertTimer = window.setTimeout(() => {
    elements.alerts.dataset.visible = "false";
    elements.alerts.hidden = true;
  }, 2800);
}

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function claimPayload(claim: Claim) {
  return `${claim.id}|${claim.statement}|${claim.evidence}`;
}

async function verifyClaim(claimIndex: number) {
  const claim = PROFILE.claims[claimIndex];
  const key = await crypto.subtle.importKey("spki", fromBase64(PROFILE.publicKey), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    fromBase64(claim.signature),
    new TextEncoder().encode(claimPayload(claim)),
  );
}

function asHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashArtifact(url: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}${url}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Artifact unavailable: ${response.status}`);
  return asHex(new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer())));
}

function nodePosition(node: { x: number; y: number; mobileX: number; mobileY: number }) {
  return window.matchMedia("(max-width: 680px)").matches
    ? { x: node.mobileX, y: node.mobileY }
    : { x: node.x, y: node.y };
}

function applyGraphPositions() {
  CLAIM_NODES.forEach((node) => {
    const element = query<HTMLElement>(`[data-claim-id="${node.id}"]`);
    const position = nodePosition(node);
    element.style.left = `${position.x}%`;
    element.style.top = `${position.y}%`;
  });
  EVIDENCE_NODES.forEach((node) => {
    const element = query<HTMLElement>(`[data-evidence-id="${node.id}"]`);
    if (dragState?.id === node.id && dragState.dragged) return;
    const position = nodePosition(node);
    element.style.left = `${position.x}%`;
    element.style.top = `${position.y}%`;
  });
  updateConnectionLines();
}

function createGraphNodes() {
  CLAIM_NODES.forEach((node) => {
    const button = document.createElement("button");
    const claim = PROFILE.claims[node.index];
    button.type = "button";
    button.className = "graph-node claim-node";
    button.dataset.claimId = node.id;
    button.disabled = true;
    button.setAttribute("aria-label", `Claim: ${claim.statement}`);
    button.innerHTML = `<span>C${node.index + 1}</span><strong>${node.short}</strong><small>UNTESTED</small>`;
    button.addEventListener("click", () => {
      if (selectedEvidence) void attemptConnection(selectedEvidence, node.id);
    });
    elements.claimLayer.append(button);
  });

  EVIDENCE_NODES.forEach((node, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "graph-node evidence-node";
    button.dataset.evidenceId = node.id;
    button.dataset.grade = node.grade;
    button.disabled = true;
    button.setAttribute("aria-label", `Evidence: ${node.label}. ${node.grade}`);
    button.innerHTML = `<span>E${String(index + 1).padStart(2, "0")}</span><strong>${node.short}</strong><small>${node.grade}</small>`;
    button.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      selectEvidence(node.id);
    });
    button.addEventListener("pointerdown", (event) => beginDrag(event, node.id));
    elements.evidenceLayer.append(button);
  });
  applyGraphPositions();
}

function evidenceById(id: EvidenceId) {
  return EVIDENCE_NODES.find((evidence) => evidence.id === id)!;
}

function claimById(id: ClaimId) {
  return CLAIM_NODES.find((claim) => claim.id === id)!;
}

function selectEvidence(id: EvidenceId) {
  selectedEvidence = id;
  queryAll<HTMLElement>("[data-evidence-id]").forEach((element) => {
    element.dataset.selected = String(element.dataset.evidenceId === id);
  });
  const evidence = evidenceById(id);
  const connection = connections.get(id);
  elements.inspector.dataset.open = "true";
  elements.inspectorEmpty.hidden = true;
  elements.inspectorContent.hidden = false;
  elements.inspectorGrade.textContent = evidence.grade;
  elements.inspectorGrade.dataset.grade = evidence.grade;
  elements.inspectorId.textContent = id.toUpperCase();
  elements.inspectorTitle.textContent = evidence.label;
  elements.inspectorSource.textContent = evidence.source;
  elements.inspectorScope.textContent = evidence.scope;
  elements.inspectorTarget.textContent = connection ? claimById(connection.claim).label : "MATCH AGAINST A PUBLIC CLAIM";
  elements.inspectorResult.textContent = connection
    ? connection.status === "verified" ? "VERIFIED WITHIN STATED SCOPE" : "UNRESOLVED / SOURCE ABSENT"
    : "NOT TESTED";
  elements.inspectorResult.dataset.status = connection?.status ?? "untested";
  elements.inspectorDigest.textContent = connection?.digest ? `SHA-256 / ${connection.digest}` : "";
  elements.fieldCommand.textContent = connection ? "EVIDENCE ALREADY RESOLVED" : "SELECT A CLAIM OR DRAG TO CONNECT";
}

function beginDrag(event: PointerEvent, id: EvidenceId) {
  if (!visitorSession || connections.has(id)) return;
  const element = event.currentTarget as HTMLButtonElement;
  dragState = { id, startX: event.clientX, startY: event.clientY, dragged: false };
  element.setPointerCapture(event.pointerId);
  const onMove = (moveEvent: PointerEvent) => {
    if (!dragState) return;
    if (Math.hypot(moveEvent.clientX - dragState.startX, moveEvent.clientY - dragState.startY) > 5) dragState.dragged = true;
    if (!dragState.dragged) return;
    const bounds = elements.observatory.getBoundingClientRect();
    element.dataset.dragging = "true";
    element.style.left = `${moveEvent.clientX - bounds.left}px`;
    element.style.top = `${moveEvent.clientY - bounds.top}px`;
  };
  const onUp = (upEvent: PointerEvent) => {
    element.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerup", onUp);
    if (!dragState) return;
    const wasDragged = dragState.dragged;
    dragState = undefined;
    element.dataset.dragging = "false";
    if (wasDragged) {
      suppressClick = true;
      element.style.pointerEvents = "none";
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest<HTMLElement>("[data-claim-id]");
      element.style.pointerEvents = "";
      if (target) void attemptConnection(id, target.dataset.claimId as ClaimId);
      else selectEvidence(id);
    }
    applyGraphPositions();
  };
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerup", onUp);
}

function connectionEndpoints(connection: Connection) {
  const field = elements.observatory.getBoundingClientRect();
  const from = query<HTMLElement>(`[data-evidence-id="${connection.evidence}"]`).getBoundingClientRect();
  const to = query<HTMLElement>(`[data-claim-id="${connection.claim}"]`).getBoundingClientRect();
  return {
    x1: from.left + from.width / 2 - field.left,
    y1: from.top + from.height / 2 - field.top,
    x2: to.left + to.width / 2 - field.left,
    y2: to.top + to.height / 2 - field.top,
  };
}

function updateConnectionLines() {
  elements.connections.replaceChildren();
  elements.connections.setAttribute("viewBox", `0 0 ${elements.observatory.clientWidth} ${elements.observatory.clientHeight}`);
  connections.forEach((connection) => {
    const { x1, y1, x2, y2 } = connectionEndpoints(connection);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const bend = Math.max(60, Math.abs(x2 - x1) * 0.42);
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.dataset.status = connection.status;
    path.dataset.evidence = connection.evidence;
    elements.connections.append(path);
  });
}

function setConnection(connection: Connection) {
  connections.set(connection.evidence, connection);
  const node = query<HTMLElement>(`[data-evidence-id="${connection.evidence}"]`);
  node.dataset.state = connection.status;
  node.querySelector("small")!.textContent = connection.status === "verified" ? "VERIFIED" : "UNRESOLVED";
  updateConnectionLines();
  selectEvidence(connection.evidence);
  updateClaimStates();
}

async function attemptConnection(evidenceId: EvidenceId, claimId: ClaimId) {
  if (!visitorSession || connections.has(evidenceId)) return;
  const evidence = evidenceById(evidenceId);
  selectEvidence(evidenceId);
  if (evidence.target !== claimId) {
    elements.inspectorResult.textContent = "REJECTED / SCOPE DOES NOT MATCH CLAIM";
    elements.inspectorResult.dataset.status = "rejected";
    query<HTMLElement>(`[data-evidence-id="${evidenceId}"]`).dataset.state = "rejected";
    window.setTimeout(() => { query<HTMLElement>(`[data-evidence-id="${evidenceId}"]`).dataset.state = "idle"; }, 800);
    scene.pulse("rejected");
    announce("CONNECTION REJECTED / EVIDENCE SCOPE MISMATCH", "error");
    return;
  }

  const node = query<HTMLButtonElement>(`[data-evidence-id="${evidenceId}"]`);
  node.dataset.state = "working";
  elements.fieldCommand.textContent = `VERIFYING ${evidence.short}`;
  try {
    if (evidence.verifier === "signature") {
      if (!(await verifyClaim(evidence.claimIndex!))) throw new Error("Signature mismatch");
      setConnection({ evidence: evidenceId, claim: claimId, status: "verified" });
      await maybeUnlockOwnerCapsule();
    } else if (evidence.verifier === "artifact") {
      const digest = await hashArtifact(evidence.artifactUrl!);
      if (digest !== evidence.expectedHash) throw new Error("Artifact hash mismatch");
      setConnection({ evidence: evidenceId, claim: claimId, status: "verified", digest });
      await unlockProject("proof", PROOF_CAPSULE_KEY, evidence.grade, [evidenceId]);
    } else if (evidence.verifier === "merkle") {
      const candidate = BUILDER_OPTIONS[1];
      if (!(await verifyBuilderLeaf(candidate))) throw new Error("Merkle proof mismatch");
      setConnection({ evidence: evidenceId, claim: claimId, status: "verified" });
      await unlockProject("builder", candidate, evidence.grade, [evidenceId]);
    } else if (evidence.verifier === "zk") {
      pendingZkTarget = claimId;
      node.dataset.state = "idle";
      renderDisclosure();
      elements.zkDialog.showModal();
      return;
    } else {
      setConnection({ evidence: evidenceId, claim: claimId, status: "unresolved" });
      scene.pulse("unresolved");
      announce("SOURCE MISSING / CLAIM REMAINS SELF-ATTESTED", "error");
      return;
    }
    scene.pulse("verified");
    announce(`${evidence.grade} VERIFIED / SCOPE RECORDED`, "success");
  } catch (error) {
    console.error(error);
    node.dataset.state = "rejected";
    elements.inspectorResult.textContent = "REJECTED / CRYPTOGRAPHIC CHECK FAILED";
    elements.inspectorResult.dataset.status = "rejected";
    scene.pulse("rejected");
    announce("CRYPTOGRAPHIC CHECK FAILED / CONNECTION NOT ADDED", "error");
  } finally {
    elements.fieldCommand.textContent = "SELECT EVIDENCE / CONNECT TO CLAIM";
  }
}

async function maybeUnlockOwnerCapsule() {
  const signatureIds: EvidenceId[] = ["sig-ai", "sig-crypto", "sig-exit"];
  if (signatureIds.every((id) => connections.get(id)?.status === "verified")) {
    await unlockProject("cypherpunk", CYPHER_PHRASE, "SELF-ATTESTED / 3 SIGNATURES", signatureIds);
  }
}

const projectPositions: Record<RouteId, { x: number; y: number; mobileX: number; mobileY: number }> = {
  cypherpunk: { x: 51, y: 22, mobileX: 51, mobileY: 19 },
  proof: { x: 55, y: 51, mobileX: 53, mobileY: 49 },
  builder: { x: 48, y: 78, mobileX: 49, mobileY: 78 },
};

async function unlockProject(route: RouteId, key: string, grade: string, evidenceIds: EvidenceId[]) {
  if (projects.has(route)) return;
  const capsule = await decryptRouteCapsule(route, key);
  projects.set(route, { capsule, grade, evidence: evidenceIds });
  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-node";
  button.dataset.projectRoute = route;
  button.innerHTML = `<span>DECRYPTED</span><strong>${capsule.project}</strong><small>${grade}</small>`;
  button.addEventListener("click", () => openProject(route));
  elements.projectLayer.append(button);
  const position = nodePosition(projectPositions[route]);
  button.style.left = `${position.x}%`;
  button.style.top = `${position.y}%`;
  elements.sessionFragments.textContent = `${Math.min(projects.size, 2)} / 2 KEYS`;
  if (projects.size >= 2) elements.vaultTrigger.hidden = false;
  updateSceneResolution();
}

function updateSceneResolution() {
  const verified = Array.from(connections.values()).filter((connection) => connection.status === "verified").length;
  const value = Math.min(1, verified / 6 + projects.size * 0.08);
  scene.setResolution(value);
}

function updateClaimStates() {
  const grades: Record<ClaimId, string> = {
    "claim-ai": "UNTESTED",
    "claim-crypto": "UNTESTED",
    "claim-exit": "UNTESTED",
  };
  const gradePriority: Record<string, number> = {
    "UNTESTED": 0,
    "SELF-ATTESTED": 1,
    "SOURCE MISSING": 1,
    "DEMO COMMITMENT": 2,
    "LOCAL PROOF": 2,
    "PUBLIC ARTIFACT": 3,
  };
  connections.forEach((connection, evidenceId) => {
    const evidence = evidenceById(evidenceId);
    const grade = connection.status === "unresolved" ? "SOURCE MISSING" : evidence.grade;
    if (gradePriority[grade] >= gradePriority[grades[connection.claim]]) grades[connection.claim] = grade;
  });
  CLAIM_NODES.forEach((claim) => {
    const element = query<HTMLElement>(`[data-claim-id="${claim.id}"]`);
    element.dataset.state = grades[claim.id].toLowerCase().replaceAll(" ", "-");
    element.querySelector("small")!.textContent = grades[claim.id];
  });
  elements.claimResolution.replaceChildren();
  CLAIM_NODES.forEach((claim) => {
    const span = document.createElement("span");
    span.textContent = `${claim.short} / ${grades[claim.id]}`;
    elements.claimResolution.append(span);
  });
  updateSceneResolution();
}

function openProject(route: RouteId) {
  const project = projects.get(route)!;
  elements.projectField.textContent = project.capsule.field;
  elements.projectGrade.textContent = project.grade;
  elements.projectTitle.textContent = project.capsule.title;
  elements.projectBody.textContent = project.capsule.body;
  elements.projectName.textContent = project.capsule.project;
  elements.projectTrace.textContent = project.capsule.trace;
  elements.projectEvidenceChain.replaceChildren();
  project.evidence.forEach((evidenceId, index) => {
    const evidence = evidenceById(evidenceId);
    const row = document.createElement("div");
    const number = document.createElement("span");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const scope = document.createElement("small");
    number.textContent = `E${String(index + 1).padStart(2, "0")}`;
    title.textContent = evidence.label;
    scope.textContent = evidence.grade;
    content.append(title, scope);
    row.append(number, content);
    elements.projectEvidenceChain.append(row);
  });
  elements.projectDialog.showModal();
}

function getLocalValues(): Record<DisclosureKey, string> {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UNAVAILABLE",
    viewport: `${window.innerWidth}x${window.innerHeight} / DPR ${window.devicePixelRatio.toFixed(1)}`,
    referrer: document.referrer ? new URL(document.referrer).hostname : "NONE DETECTED",
  };
}

function disclosureTotal() {
  return Object.values(disclosure).filter(Boolean).length;
}

function renderDisclosure() {
  const values = getLocalValues();
  const total = disclosureTotal();
  (Object.keys(disclosure) as DisclosureKey[]).forEach((key) => {
    const row = query<HTMLElement>(`[data-disclosure-row="${key}"]`);
    const input = query<HTMLInputElement>(`#disclosure-${key}`);
    const value = query<HTMLElement>(`#${key}-value`);
    input.checked = disclosure[key];
    row.dataset.state = disclosure[key] ? "allowed" : "withheld";
    value.textContent = disclosure[key] ? values[key] : "WITHHELD";
  });
  elements.disclosureCount.textContent = `${total} / 3 SIGNALS`;
  elements.proofStatus.textContent = total <= 1 ? "READY / ONE SIGNAL MAXIMUM" : "BLOCKED / POLICY EXCEEDED";
  elements.generateProof.disabled = total > 1 || Boolean(proofReceipt);
}

function formatNullifier(value: string) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

async function hashToField(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return (BigInt(`0x${hex}`) % FIELD_PRIME).toString();
}

async function generateProof() {
  if (!visitorSession || !pendingZkTarget || disclosureTotal() > 1 || proofReceipt) return;
  elements.generateProof.disabled = true;
  elements.proofStatus.textContent = "PROVING / WITNESS STAYS LOCAL";
  try {
    const { generateAndVerifyProof } = await import("./zk");
    const operator = await hashToField(visitorSession.fingerprint);
    const result = await generateAndVerifyProof({
      disclosureTimezone: disclosure.timezone ? "1" : "0",
      disclosureViewport: disclosure.viewport ? "1" : "0",
      disclosureReferrer: disclosure.referrer ? "1" : "0",
      operator,
      policy: POLICY,
    });
    if (!result.verified) throw new Error("Proof rejected");
    proofReceipt = result.receipt;
    elements.proofStatus.textContent = "VERIFIED / POLICY HELD";
    elements.proofNullifier.textContent = `PUBLIC NULLIFIER / ${formatNullifier(result.receipt.publicSignals[0])}`;
    setConnection({ evidence: "local-zk", claim: pendingZkTarget, status: "verified", digest: result.receipt.publicSignals[0] });
    scene.pulse("verified");
    announce("GROTH16 PROOF VERIFIED / BIOGRAPHICAL SCOPE UNCHANGED", "success");
  } catch (error) {
    console.error(error);
    elements.proofStatus.textContent = "REJECTED / CIRCUIT FAILED";
    elements.generateProof.disabled = false;
    scene.pulse("rejected");
    announce("GROTH16 PROOF REJECTED", "error");
  }
}

async function beginSession() {
  if (visitorSession) return;
  elements.beginSession.disabled = true;
  elements.beginSession.querySelector("span")!.textContent = "GENERATING NON-EXTRACTABLE KEY";
  try {
    visitorSession = await createVisitorSession();
    elements.sessionState.textContent = "OBSERVER";
    elements.sessionFingerprint.textContent = visitorSession.fingerprint;
    elements.entryGate.dataset.hidden = "true";
    elements.fieldCommand.textContent = "SELECT EVIDENCE / CONNECT TO CLAIM";
    elements.shell.dataset.session = "active";
    queryAll<HTMLButtonElement>(".graph-node").forEach((button) => { button.disabled = false; });
    scene.setResolution(0.12);
    announce("EPHEMERAL VISITOR KEY READY / NOTHING PERSISTED", "success");
  } catch (error) {
    console.error(error);
    elements.beginSession.disabled = false;
    elements.beginSession.querySelector("span")!.textContent = "RETRY EPHEMERAL KEY";
    announce("SESSION KEY GENERATION FAILED", "error");
  }
}

function renderFinal(capsule: FinalCapsule, signature: string) {
  elements.finalLevel.textContent = capsule.level;
  elements.finalSession.textContent = `SESSION / ${visitorSession!.fingerprint}`;
  elements.finalTitle.textContent = capsule.title;
  elements.finalBody.textContent = capsule.body;
  elements.frontierList.replaceChildren();
  capsule.frontiers.forEach((frontier, index) => {
    const row = document.createElement("div");
    const number = document.createElement("span");
    const title = document.createElement("strong");
    number.textContent = `0${index + 1}`;
    title.textContent = frontier;
    row.append(number, title);
    elements.frontierList.append(row);
  });
  elements.finalChannel.textContent = capsule.openChannel;
  elements.finalLine.textContent = capsule.finalLine;
  elements.sessionSignature.textContent = signature;
}

async function decryptVault() {
  if (!visitorSession || projects.size < 2) return;
  if (finalCapsule) {
    elements.finalDialog.showModal();
    return;
  }
  elements.vaultTrigger.disabled = true;
  elements.vaultTrigger.querySelector("strong")!.textContent = "RECONSTRUCTING SHAMIR SECRET";
  try {
    const selectedProjects = Array.from(projects.entries()).slice(0, 2);
    finalCapsule = await decryptFinalCapsule(selectedProjects.map(([, project]) => project.capsule.share));
    const transcript = {
      protocol: PROTOCOL_VERSION,
      session: visitorSession.fingerprint,
      projects: selectedProjects.map(([route, project]) => ({ route, grade: project.grade })),
      evidence: Array.from(connections.values()),
      unlockedAt: new Date().toISOString(),
    };
    const signature = await signTranscript(visitorSession.keyPair.privateKey, transcript);
    sessionReceipt = { transcript, publicKey: visitorSession.publicKey, signature, groth16: proofReceipt ?? null };
    renderFinal(finalCapsule, signature);
    elements.sessionState.textContent = "TRUSTED READER";
    elements.shell.dataset.session = "trusted";
    elements.vaultTrigger.disabled = false;
    elements.vaultTrigger.querySelector("span")!.textContent = "SESSION PROOF READY";
    elements.vaultTrigger.querySelector("strong")!.textContent = "OPEN DEEPER DOSSIER";
    scene.setResolution(1);
    scene.pulse("verified");
    elements.finalDialog.showModal();
    announce("DEEPER DOSSIER DECRYPTED / SESSION SIGNED", "success");
  } catch (error) {
    console.error(error);
    finalCapsule = undefined;
    elements.vaultTrigger.disabled = false;
    elements.vaultTrigger.querySelector("strong")!.textContent = "DECRYPT DEEPER DOSSIER";
    announce("DOSSIER KEY RECONSTRUCTION FAILED", "error");
  }
}

function downloadSessionReceipt() {
  if (!sessionReceipt) return;
  const blob = new Blob([JSON.stringify(sessionReceipt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "null-self-evidence-receipt.json";
  anchor.click();
  URL.revokeObjectURL(url);
  announce("EVIDENCE RECEIPT DOWNLOADED", "success");
}

createGraphNodes();
updateClaimStates();
renderDisclosure();

elements.beginSession.addEventListener("click", () => void beginSession());
elements.closeInspector.addEventListener("click", () => { elements.inspector.dataset.open = "false"; });
elements.vaultTrigger.addEventListener("click", () => void decryptVault());
elements.generateProof.addEventListener("click", () => void generateProof());
elements.downloadSession.addEventListener("click", downloadSessionReceipt);

(Object.keys(disclosure) as DisclosureKey[]).forEach((key) => {
  query<HTMLInputElement>(`#disclosure-${key}`).addEventListener("change", (event) => {
    disclosure[key] = (event.target as HTMLInputElement).checked;
    renderDisclosure();
  });
});

queryAll<HTMLButtonElement>("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => query<HTMLDialogElement>(`#${button.dataset.closeDialog}`).close());
});
queryAll<HTMLDialogElement>("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

window.addEventListener("resize", applyGraphPositions);
window.addEventListener("beforeunload", () => scene.destroy());
