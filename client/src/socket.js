import { io } from "socket.io-client";

// In dev (vite on :5173, server on :4000) this needs an explicit URL. When the
// server serves the built client itself (see server/src/index.js), client and
// server share an origin, so connecting with no URL (same-origin) just works --
// including through a tunnel, since there's only one public URL either way.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? "http://localhost:4000" : undefined);

export const socket = io(SERVER_URL, { autoConnect: true });
