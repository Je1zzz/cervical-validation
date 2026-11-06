# Cervical Validation

Doctor-facing TCT report review interface at `/tct/`.

Static HTML, CSS and JavaScript; GitHub Pages hosts the interface. Case records and feedback are stored in a separate access-code-protected service. This repository contains no patient records or access codes.

Clinicians use the provided access code, look up the original report in their hospital system, select corrections and save. Original values remain unchanged. Administrators can export feedback as CSV using their separate access code.

Dates shown are original WSI scan dates, not TCT examination dates. The interface is for report reconciliation, not automated diagnosis. Reviewer progress is associated with a random identifier in the current browser; use the same browser to resume.
