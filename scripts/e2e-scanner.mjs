import http from "node:http";

const port = Number(process.env.E2E_SCANNER_PORT || "3311");
const host = "127.0.0.1";
const MAX_BYTES = 6 * 1024 * 1024;

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.setHeader("Content-Type", "text/plain");
    response.end("ok");
    return;
  }
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end("method not allowed");
    return;
  }

  const chunks = [];
  let size = 0;
  request.on("data", chunk => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      response.statusCode = 413;
      response.end("too large");
      request.destroy();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  request.on("end", () => {
    const body = Buffer.concat(chunks);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(body.includes("EICAR")
      ? { status: "infected", detail: "Eicar-Test-Signature" }
      : { status: "clean" }));
  });
});

server.listen(port, host, () => {
  console.log(`E2E test scanner listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
