---
"@backts/cli": patch
"@backts/framework": patch
"create-backts": patch
---

Upgrade scriptc to 0.1.1 and preserve native build inputs for compiler cache reuse. Keep generic controller snapshots statically compilable and preserve mapped HTTP errors, including their status and object identity, across the compiler's optional-value throw boundary.
