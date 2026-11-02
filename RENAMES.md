# Renamed projects: old pages stay as pointers

> 旧仓/旧 npm 不删除、不 unpublish；旧页顶部保留 **Moved** 横幅，新页顶部保留 **Renamed / formerly** 横幅。本表是统一索引。

| Old | New | Old repo | New repo | Old npm | New npm | Status |
|---|---|---|---|---|---|---|
| `dsh-plugin-guide` | `dsh-primer` | https://github.com/PerryLink/dsh-plugin-guide | https://github.com/PerryLink/dsh-primer | `dsh-plugin-guide` (deprecated) | `dsh-primer` | old repo points to new; old npm deprecated |
| `dsh-plugin-doctor` | `dsh-clinic` | https://github.com/PerryLink/dsh-plugin-doctor | https://github.com/PerryLink/dsh-clinic | `@perrylink/dsh-plugin-doctor` (deprecated) | `dsh-clinic` | old repo points to new; old npm deprecated |

## Rules

- Old repos remain public as pointer/backup; do not archive into a dead page.
- Old README first block: **Moved** + new repo + new npm + this table.
- New README first block: **Renamed / formerly** + old repo.
- Old npm: `npm deprecate` with a message pointing to the new package; do not unpublish.
- Old docs/GitHub Pages: canonical banner to the new page; old content stays.
- Details and dates: [`49-配套包改名迁移记录-2026-11-02.md`](49-配套包改名迁移记录-2026-11-02.md).
