import Phaser from "phaser";
import { MatchConnection } from "./net/connection.js";
import { MatchSession } from "./net/match-session.js";
import { MatchScene, type MatchSceneData } from "./scenes/match-scene.js";

/**
 * Client bootstrap: connect → wait for assignment + config + snapshot →
 * start the Phaser scene. The DOM status line covers the connection and
 * matchmaking wait; Phaser owns everything afterwards.
 */

const rawServerUrl: unknown = import.meta.env.VITE_SERVER_URL;
const SERVER_URL = typeof rawServerUrl === "string" ? rawServerUrl : "ws://localhost:2567";

function setStatus(text: string): void {
  const element = document.getElementById("status");
  if (element !== null) {
    element.textContent = text;
  }
}

async function boot(): Promise<void> {
  const session = new MatchSession();
  setStatus(`Connecting to ${SERVER_URL}…`);
  const connection = await MatchConnection.join(SERVER_URL, session);
  setStatus("Waiting for an opponent…");

  session.whenReady(() => {
    if (session.playerId === null || session.config === null || session.snapshot === null) {
      return;
    }
    setStatus("");
    const data: MatchSceneData = {
      session,
      connection,
      config: session.config,
      snapshot: session.snapshot,
      playerId: session.playerId,
    };
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "app",
      width: 960,
      height: 640,
      backgroundColor: "#0e1420",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });
    game.scene.add("match", MatchScene, true, data);
  });
}

boot().catch((error: unknown) => {
  setStatus(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
});
