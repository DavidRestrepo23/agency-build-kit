export function runCli(main) {
  let result;
  try {
    result = main(process.argv.slice(2));
  } catch (err) {
    result = { ok: false, errors: [{ file: err.file ?? null, path: '/', message: err.message }] };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok === false ? 1 : 0);
}
