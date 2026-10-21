// Production: serve the built site and the API from one process.  npm run build && npm start
import express from 'express';
import { fileURLToPath } from 'node:url';
import { app } from './app.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
app.use(express.static(dist));
const port = Number(process.env.PORT) || 5173;
app.listen(port, () => console.log(`AniMahou running at http://localhost:${port}  (admin: /admin.html)`));
