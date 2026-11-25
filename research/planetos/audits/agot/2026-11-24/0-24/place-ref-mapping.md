# AGOT 0–24: mapping place candidates to current refs

Read-only mapping of place rows from `chapter-index-gaps.csv` against the available checkout:

- Checkout: `/Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit`
- Planetos package read: `2026.11.24.37`
- Manifest layers: 57
- Unique refs across those layers: 837
- Place refs found: 160
- Candidate rows: 109 across 16 chapter groups
- Decisions: add 17, ambiguous 45, no-card 47
- Roles: scene 2, reference 107, dream-place 0

## Classification notes

The requested `.36` snapshot was not available in this checkout; the package read during this pass is `.37`. This is a read-only mapping against the current package refs, not an integration.

`add` is limited to candidates whose numeric chapter synopsis supports an actual scene or a clear reference and for which the package has a matching stable ref. Scene candidates supported by the synopsis are `place:wolfswood` in chapter 13 and `place:eel-alley` in chapter 18. Other direct synopsis mentions with existing refs are classified as references.

Candidates present only in the AWOIAF Places list remain ambiguous when a package ref exists, or `no-card` when no matching ref exists. A blank `target_ref` means this package has no matching stable place ref; it is not a request to create one in this pass. The synopsis is secondary evidence only; primary-edition verification remains pending. No candidate is classified as `dream-place`: the dreams in chapters 23 and 24 do not identify any candidate here as their setting.

`Blackwater Rush` in chapter 18 is not mapped to `Blackwater Bay`; the synopsis names the bay as the ship’s setting, while the candidate is a distinct feature. Hardin’s Tower in chapter 19 is not mapped to the different Lord Commander’s Tower.
