const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("Usage: node scripts/assert-safe-db.mjs DATABASE_URL [TEST_DATABASE_URL ...]");
  process.exit(1);
}

let failed = false;
for (const name of names) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required.`);
    failed = true;
    continue;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error(`${name} is not a valid URL.`);
    failed = true;
    continue;
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const host = url.hostname.toLowerCase();
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const safeName = /(_test|_e2e)$/.test(database) && !/prod/i.test(database);
  if (!localHost || !safeName) {
    console.error(`${name} must target a local disposable database ending in _test or _e2e.`);
    failed = true;
  } else {
    console.log(`${name} is a safe disposable target (${database}).`);
  }
}

if (failed) process.exit(1);
