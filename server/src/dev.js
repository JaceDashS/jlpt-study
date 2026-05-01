import { startApiServer } from "./api-server.js";

const server = await startApiServer();

async function closeServer() {
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
  process.exit(0);
}

process.once("SIGINT", () => {
  closeServer();
});

process.once("SIGTERM", () => {
  closeServer();
});
