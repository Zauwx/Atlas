import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MatchRoom } from "./rooms/match-room.js";

/** Server bootstrap — run with `npm start` from packages/server. */
const port = Number(process.env.PORT ?? "2567");

const gameServer = new Server({
  transport: new WebSocketTransport({ server: createServer() }),
});
gameServer.define("match", MatchRoom);

void gameServer.listen(port).then(() => {
  process.stdout.write(`Atlas server listening on ws://localhost:${String(port)}\n`);
});
