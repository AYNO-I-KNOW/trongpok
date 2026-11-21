import { loadEnvConfig } from "@next/env";
import { loadPersonas, personaRequest } from "../src/lib/personas";
import { runArenaRequest } from "../src/lib/agents/service";

loadEnvConfig(process.cwd());

async function main() {
  const personas = await loadPersonas();
  if (!personas.length) throw new Error("No personas available");
  for (const persona of personas) {
    await runArenaRequest(personaRequest(persona), undefined, { strictCache: true, replayDelayMs: 0 });
    console.log(persona.persona_id);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
