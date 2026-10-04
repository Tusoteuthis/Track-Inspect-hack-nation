// Cloudflare Worker fronting the Next.js container (see wrangler.jsonc, Dockerfile).
// All traffic goes to ONE named instance: the backend keeps locks, jobs and SSE in process memory.
import { Container, getContainer } from "@cloudflare/containers";

type Env = {
  APP: DurableObjectNamespace<App>;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_AGENT_ID_EXPERT?: string;
  ELEVENLABS_AGENT_ID_TUTOR?: string;
  BACKEND_ACCESS_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
};

const FORWARDED_SECRETS = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID_EXPERT",
  "ELEVENLABS_AGENT_ID_TUTOR",
  "BACKEND_ACCESS_TOKEN",
  "ANTHROPIC_API_KEY",
] as const;

export class App extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "2h";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const vars: Record<string, string> = {};
    for (const name of FORWARDED_SECRETS) {
      const value = env[name];
      if (value) vars[name] = value;
    }
    this.envVars = vars;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Response is returned as-is so SSE bodies stream through unbuffered.
    return getContainer(env.APP, "main").fetch(request);
  },
};
