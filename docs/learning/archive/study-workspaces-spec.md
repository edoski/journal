# Directory-local study workspaces

Approved direction: one installed learning engine, independent `.study` directories,
no global learning-state fallback. Implementation baseline: `2139b09`.

Status: implemented and reviewed; see [delivery and cutover results](study-workspaces-results-2026-09-23.md).
During implementation the user additionally authorized migration of all clearly
attributed personal course material and removal of the three old global locations
after verification. That operational cutover is recorded separately from the
non-destructive general import command specified below.

`study init` initializes the current directory without a questionnaire, model call,
copied runtime or inferred subject. Repeating it preserves existing state. A small
versioned `.study/workspace.json` marks ownership. State, preferences, resumable Pi
conversations, lessons and generated assets all live inside `.study`; existing
source material remains in place. The existing scope/record/retrieval contracts
remain authoritative. No new global defaults, registry, cross-workspace links,
automatic aggregation or synchronization are introduced.

Ordinary startup finds the nearest enclosing initialized directory. Nested
workspaces do not inherit or merge parent records. An invalid nearer marker fails
instead of falling back to an ancestor. Explicit `--workspace DIRECTORY` selects
that exact initialized directory. Pi pins its selected workspace for tools and
resume; native agents use the same resolver and explicit workspace selection when
their execution directory is elsewhere. Missing workspaces give an actionable
error, never create state or consult the former global root. Initialization always
targets the requested directory, even inside an existing parent workspace.

The global launcher must preserve the caller's working directory. It supports
`study`, `study init`, `study --continue`, the existing study startup options and
explicit workspace selection. Canonical agent CLI commands expose the same
selection. All derived output locations are fixed within `.study`; legacy root,
asset and session environment overrides no longer route normal study operations.
Relative source paths resolve from the owning directory. Moving the directory
with its material keeps these references usable. External absolute sources remain
external. Owned generated embeds must work from nested directories and after moves.

Private sessions copy only the selected workspace's portable records into a
disposable workspace, retain read-only access to its sources, disable persistent
artifacts/native transcripts, and leave the original unchanged. Existing no-save,
revision/digest, qualification review and annotation protection remain intact.
Physical isolation is a routing guarantee, not a filesystem sandbox for native tools.

No implicit migration of personal state. Provide an explicit, checked scope import
from an existing learning root into an initialized workspace: preview first, apply
only on request, never overwrite existing state, preserve originals, rebase relative
source paths (including captured reference paths), retain provenance and evidence,
and copy only that scope's preferences. Unscoped preferences require an explicit
option. Historical mixed conversations/artifacts stay in the source archive; do not
pretend to partition them safely. Personal imports require an unambiguous requested
destination. Import is a one-time operation, not compatibility routing.

Verification covers idempotent initialization, malformed/nested selection, no
global fallback, independent scopes with identical names, preference/discovery
isolation, workspace-bound resume/tools, relative source portability, artifacts,
private mode, and non-destructive import. Use synthetic fixtures, the focused
learning gate, independent Standards/Spec review and installed-command smoke tests.
Refresh installed launchers/skills after review; preserve personal records unless
their import is separately authorized. Native provider histories outside Pi remain
host-owned. No claims of improved human learning or universal host UI parity.
