/** Version tag for WS6-owned records (`KnowledgeRevision.schema_version`). WS3 records keep `ws3.v0`. */
export const SCHEMA_VERSION = "ws6.v0" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;
