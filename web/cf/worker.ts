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

  /** Kill the container and evict this Durable Object, so both come back with the current secrets. */
  async reset(): Promise<void> {
    await this.destroy();
    this.ctx.abort("reset");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.APP, "main");
    // POST /__restart (bearer BACKEND_ACCESS_TOKEN): kill the container so the next request boots a fresh one
    // with current secrets and empty data.
    if (new URL(request.url).pathname === "/__restart") {
      const token = env.BACKEND_ACCESS_TOKEN;
      if (request.method !== "POST" || !token || request.headers.get("authorization") !== `Bearer ${token}`) {
        return new Response("forbidden", { status: 403 });
      }
      await container.reset().catch(() => {}); // abort() rejects the call by design
      return new Response("restarted", { status: 200 });
    }
    // Response is returned as-is so SSE bodies stream through unbuffered.
    return container.fetch(request);
  },
};
