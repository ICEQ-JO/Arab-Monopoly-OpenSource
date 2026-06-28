import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_PATH = path.join(DATA_DIR, "rooms.json");

export function loadSnapshots() {
  try {
    if (!fs.existsSync(FILE_PATH)) return {};
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Failed to load persisted rooms, starting fresh:", err.message);
    return {};
  }
}

// Writes via a temp file + rename so a crash mid-write can't leave rooms.json
// half-written and unparsable on the next startup.
export function saveSnapshots(snapshots) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshots));
    fs.renameSync(tmpPath, FILE_PATH);
  } catch (err) {
    console.error("Failed to persist rooms:", err.message);
  }
}
