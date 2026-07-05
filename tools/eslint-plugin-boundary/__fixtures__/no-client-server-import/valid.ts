// VALID fixture for no-client-server-import.
//
// This file is NOT under libs/features/<feature>/client, so the rule
// never fires (the rule only triggers on client files). Even if it
// did fire on any path, the export below does not import from a
// /server/ path, so no violation should be reported.

export const ok = "valid: outside client/, no server import";