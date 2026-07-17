# Security Policy

**This is a teaching demo, not production cryptography.** It runs entirely in the browser,
holds no server-side secrets, protects no real content, and generates fresh key material per
page load. Nothing here should be deployed to protect anything.

## Reports that are in scope (please open a GitHub issue)

- **Algorithmic incorrectness**: a cover that fails the partition property, a non-member
  able to derive a subset key, a revoked subscriber able to decrypt, a KAT that shouldn't
  pass, a tracing claim the code doesn't actually satisfy.
- **Dishonest claims**: any place where UI copy or the README overstates what the
  construction proves (precision of claims is treated as a correctness bug here).
- **Accessibility regressions** that slip past the axe gate.

## Out of scope

- Side-channel or timing issues in the browser demo (e.g., non-constant-time helpers used
  for display); the demo does not defend against a local adversary.
- "The pirate decoder can be built by the user" — that is the exhibit, not a vulnerability.
- Vulnerability reports against the demonstrated-and-labeled failure modes (the evasive
  coalition defeating the simple tracer is intentional and documented).

There is no bug bounty. If you believe you've found something sensitive enough that a public
issue is inappropriate, use the contact information on the GitHub profile.
