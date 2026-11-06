# Cervical Validation

Doctor-facing TCT report review interface at `/tct/`.

Static HTML, CSS and JavaScript; GitHub Pages hosts the interface. Case records and feedback are stored in a separate access-code-protected service. This repository contains no patient records or access codes.

The live backend uses Supabase project `cznnzigxstshvzosypch`, Edge Function `tct-review`. Source is in `supabase/functions/tct-review/index.ts`. The SQL file describes the initial schema and includes a fictional test case; access hashes and real case records must be provisioned privately. Direct anonymous/authenticated table access is revoked; the function verifies the access code before using its server-side database credential. Review saves and history append in one database transaction.

Clinicians use the provided access code and review a scrollable spreadsheet with patient name, scan date, WSI filename, preoperative TCT, postoperative TCT, corrected preoperative TCT, and corrected postoperative TCT. The first five columns are read-only. The two correction columns begin blank and accept free text; edits save on leaving a cell, with a manual save button and visible failure/retry status. Previously saved corrections restore on login. Administrators can export feedback as CSV using their separate access code.

Dates shown are original WSI scan dates, not TCT examination dates. The interface is for report reconciliation, not automated diagnosis. Reviewer progress is associated with a random identifier in the current browser; use the same browser to resume.
