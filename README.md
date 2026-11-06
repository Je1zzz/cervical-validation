# Cervical Validation

Doctor-facing TCT report review interface at `/tct/`.

Static HTML, CSS and JavaScript; GitHub Pages hosts the interface. Case records and feedback are stored in a separate access-code-protected service. This repository contains no patient records or access codes.

The live backend uses Supabase project `cznnzigxstshvzosypch`, Edge Function `tct-review`. Source is in `supabase/functions/tct-review/index.ts`. The SQL file describes the initial schema and includes a fictional test case; access hashes and real case records must be provisioned privately. Direct anonymous/authenticated table access is revoked; the function verifies the access code before using its server-side database credential. Review saves and history append in one database transaction.

Clinicians use the provided access code, look up the original report in their hospital system, select corrections and save. Original values remain unchanged. Administrators can export feedback as CSV using their separate access code.

Dates shown are original WSI scan dates, not TCT examination dates. The interface is for report reconciliation, not automated diagnosis. Reviewer progress is associated with a random identifier in the current browser; use the same browser to resume.
