const fs = require("fs");
const path = require("path");
const { CircomRunner, bindings } = require("circom2");

async function main() {
  const args = process.argv.slice(2).map((argument) =>
    argument.startsWith("-") ? argument : path.relative(process.cwd(), argument),
  );

  const runner = new CircomRunner({
    args,
    env: process.env,
    preopens: { ".": "." },
    bindings: {
      ...bindings,
      fs,
      exit(code) {
        process.exit(code);
      },
      kill(signal) {
        process.kill(process.pid, signal);
      },
    },
  });

  const wasm = fs.readFileSync(require.resolve("circom2/circom.wasm"));
  await runner.execute(wasm);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
