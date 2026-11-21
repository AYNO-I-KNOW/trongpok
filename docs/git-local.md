# Local Git repair

The active integrated project is `trongpok-integration`. Its branch is `codex/dev2-integration`, with source revision `c288e11` from GitHub. The older `trongpok` directory contains the initial imported snapshot and staged Dev 2 work; it is retained separately.

Git for Windows is installed. Git object verification passed for the integrated project. The repository is shallow, so earlier history is not present locally.

## Completed locally

- Backed up all refs in a verified Git bundle, tracked edits in a binary patch, and 32 untracked files with SHA-256 checks, under `../git-recovery/20261121-134144`.
- Stored the pre-repair working status and prior local configuration in that backup's `manifest.json`.
- Configured repository-local author identity using the connected GitHub account `iceano22` and its GitHub noreply email.
- Removed the work branch's incorrect `origin/main` upstream, so GitHub Desktop can publish it as a separate work branch. Its own upstream will be created by the first successful `git push -u origin codex/dev2-integration`.
- Set repository-local `push.default=current` and this branch's `pushRemote=origin`. A normal push therefore targets the current branch name. Kept the Git Credential Manager configuration.
- Verified that existing tracked and untracked source changes were unchanged by the repair. No commits, merges or pushes were made by this repair.

## Network step

Direct Git transport in the restricted execution session still fails with `getaddrinfo() thread failed to start`; DNS lookups also fail. The ChatGPT GitHub connection can read the remote repository through its separate connection. That does not demonstrate that local Git transport is working.

Double-click `scripts/Open-Tongpok-Git.cmd` in Windows Explorer. It opens the correct project, shows status and runs `git fetch origin` in the normal user session. The script leaves the terminal open so any connection error can be read. It does not change project source files, commit, merge or push.

If fetch succeeds, use the project terminal or add this exact folder with GitHub Desktop's File > Add local repository. Complete tests and a build before committing feature changes. Publish the working branch with `git push -u origin codex/dev2-integration` once the work is ready.

If the normal Windows terminal also cannot resolve GitHub, retain its exact error for network troubleshooting. If it reports an authentication error instead, complete the standard Git Credential Manager GitHub sign-in prompt.

GitHub Desktop is optional for these Git commands and is still not installed by this repair.

## Automated completion

`Finish-Tongpok.cmd` runs `scripts/publish-dev2.mjs` in a normal Windows terminal. It fetches origin, runs the existing install/test/lint/build gate plus the publisher's own tests, checks that the source did not change during verification, commits the selected project changes and pushes only `codex/dev2-integration`. It then starts the local development server. A failed check stops commit and push. A push failure leaves the successful local commit intact for a later retry. It never force-pushes or merges into main.

The publisher refuses unexpected top-level files, such as an untracked `.npmrc`, and it does not stage new files created during the tests. Run this launcher from Windows Explorer because the restricted ChatGPT command session cannot resolve npm/GitHub and rejects some dependency-directory operations. The user's authorization covers the commit and push after checks pass.
