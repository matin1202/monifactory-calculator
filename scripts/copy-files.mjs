// Copies the static files next to the compiled scripts in dist/.
import { cpSync } from "node:fs";

for (const path of ["index.html", "assets", "data"])
    cpSync(path, `dist/${path}`, { recursive: true });
