import { loadProtocol, renderProtocol } from "./profile-core.mjs";

const { config, state } = await loadProtocol();
await renderProtocol(config, state);
console.log(`Rendered profile protocol revision ${state.revision}.`);
