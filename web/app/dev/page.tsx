"use client";

import { useConversationControls, useConversationStatus } from "@elevenlabs/react";
import { useState } from "react";
import { VoiceSession } from "@/components/voice/VoiceSession";
import { FLOWS, type Flow } from "@/lib/voice/flows";

export default function Home() {
  const [flow, setFlow] = useState<Flow>("expert");

  return (
    <main className="page">
      <header>
        <h1>Track Inspect</h1>
        <p className="muted">ElevenLabs voice agent</p>
      </header>

      <div role="radiogroup" aria-label="Flow" className="flow-picker">
        {(Object.keys(FLOWS) as Flow[]).map(f => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={flow === f}
            onClick={() => setFlow(f)}
            className={flow === f ? "active" : ""}
          >
            {FLOWS[f].label}
          </button>
        ))}
      </div>

      {/* key: switching flow remounts the session so it never talks to the wrong agent */}
      <VoiceSession key={flow} flow={flow}>
        <ContextSender />
      </VoiceSession>
    </main>
  );
}

// Dev helper: push a contextual update (e.g. a fixture pointing event) into the
// live conversation. The agent receives it as context without being forced to reply.
function ContextSender() {
  const { sendContextualUpdate } = useConversationControls();
  const { status } = useConversationStatus();
  const [text, setText] = useState("");

  return (
    <form
      className="context-sender"
      onSubmit={e => {
        e.preventDefault();
        if (!text.trim()) return;
        sendContextualUpdate(text.trim());
        setText("");
      }}
    >
      <label htmlFor="ctx">Contextual update (dev)</label>
      <div>
        <input
          id="ctx"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder='e.g. {"event_id":"evt-1","region":…}'
          disabled={status !== "connected"}
        />
        <button type="submit" disabled={status !== "connected" || !text.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
