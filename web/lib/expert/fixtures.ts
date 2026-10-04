// The Sprint 0 fixture pointing events, bundled for the dev console. Every one
// carries source "fixture" and must be shown as FIXTURE in the UI.
import type { PointingEvent } from "./contracts";
import evt001 from "@/fixtures/pointing-events/evt-001-resolved.json";
import evt002 from "@/fixtures/pointing-events/evt-002-resolved-sys2.json";
import evt003 from "@/fixtures/pointing-events/evt-003-repeat-of-001.json";
import evt004 from "@/fixtures/pointing-events/evt-004-ambiguous.json";
import evt005 from "@/fixtures/pointing-events/evt-005-off-record.json";

export const FIXTURE_EVENTS = [evt001, evt002, evt003, evt004, evt005] as PointingEvent[];
