# Cloud project scope

- GCP account: `gbjunior010@gmail.com`.
- GCP project: `project-7915787f-37b2-4286-aa7`.
- Run GCP commands through `scripts/gcloud.cmd` from this repository. It selects
  the `shootball-arena` configuration and pins the account and project per process.
  Do not override these targets or change the global active configuration.
- Supabase project reference: `lkgxpgcmspxekggndzih`.
- Supabase URL: `https://lkgxpgcmspxekggndzih.supabase.co`.
- Only link or operate on that Supabase project for this repository. Do not use
  another accessible project as a fallback. Where supported, pass the explicit
  project reference; otherwise verify the local link before running commands.
- Supabase linking is pending access: the saved CLI login rejected this target
  on 2026-10-05. Once a login with access is available, run
  `supabase link --project-ref lkgxpgcmspxekggndzih` and verify SQL access.
