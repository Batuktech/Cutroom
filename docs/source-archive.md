# Source archives and project backups

Use GitHub's source download or a Git checkout for the current source. To create a source archive from a known commit:

```sh
git archive --format=tar.gz --prefix=Cutroom/ --output=cutroom-source.tar.gz HEAD
```

This includes tracked source, documentation, lockfiles, synthetic sample, and bundled fonts/licenses. It excludes installed dependencies, Python environments, models, `.env`, and the live media library. The archive is not a backup of editing projects.

Extract it into an empty directory and follow [installation](installation.md). A fresh copy starts with an empty library; models need separate installation. To move editing work, stop the studio and copy the complete configured data directory. Metadata alone does not contain videos. See [privacy and backup](privacy.md).
