// Minimal Landlock launcher: allow read/execute everywhere, read-write only
// under explicitly listed directories, then exec the target.
//
// Linux 5.13+ (Landlock ABI 1); uses TRUNCATE/REFER when the ABI supports them.
// Build: cc -O2 scripts/landlock-exec.c -o /tmp/landlock-exec
// Usage: landlock-exec --rw <dir> [--rw <dir> ...] -- <command> [args...]
#define _GNU_SOURCE
#include <linux/landlock.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#ifndef LANDLOCK_ACCESS_FS_REFER
#define LANDLOCK_ACCESS_FS_REFER (1ULL << 13)
#endif
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif

static long landlock_abi(void) {
  return syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
}

static int add_rule(int ruleset_fd, const char *path, __u64 access) {
  int parent = open(path, O_PATH | O_CLOEXEC);
  if (parent < 0) {
    fprintf(stderr, "landlock-exec: open %s: %s\n", path, strerror(errno));
    return -1;
  }
  struct landlock_path_beneath_attr attr;
  memset(&attr, 0, sizeof(attr));
  attr.allowed_access = access;
  attr.parent_fd = parent;
  int rc = syscall(SYS_landlock_add_rule, ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, &attr, 0);
  if (rc != 0) fprintf(stderr, "landlock-exec: add_rule %s: %s\n", path, strerror(errno));
  close(parent);
  return rc;
}

int main(int argc, char **argv) {
  long abi = landlock_abi();
  if (abi < 1) {
    fprintf(stderr, "landlock-exec: Landlock unavailable (abi=%ld, errno=%s)\n", abi, strerror(errno));
    return 3;
  }

  __u64 handled = LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_WRITE_FILE |
                  LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR |
                  LANDLOCK_ACCESS_FS_REMOVE_DIR | LANDLOCK_ACCESS_FS_REMOVE_FILE |
                  LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_DIR |
                  LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_SOCK |
                  LANDLOCK_ACCESS_FS_MAKE_FIFO | LANDLOCK_ACCESS_FS_MAKE_BLOCK |
                  LANDLOCK_ACCESS_FS_MAKE_SYM;
  if (abi >= 2) handled |= LANDLOCK_ACCESS_FS_REFER;
  if (abi >= 3) handled |= LANDLOCK_ACCESS_FS_TRUNCATE;

  struct landlock_ruleset_attr ruleset = { .handled_access_fs = handled };
  int ruleset_fd = syscall(SYS_landlock_create_ruleset, &ruleset, sizeof(ruleset), 0);
  if (ruleset_fd < 0) {
    fprintf(stderr, "landlock-exec: create_ruleset: %s\n", strerror(errno));
    return 3;
  }

  // Read + execute everywhere; write access is denied unless a --rw rule follows.
  if (add_rule(ruleset_fd, "/", LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR) != 0) return 3;

  int i = 1;
  int saw_separator = 0;
  for (; i < argc; i++) {
    if (strcmp(argv[i], "--") == 0) { saw_separator = 1; i++; break; }
    if (strcmp(argv[i], "--rw") != 0 || i + 1 >= argc) {
      fprintf(stderr, "usage: landlock-exec --rw <dir> [--rw <dir> ...] -- <command> [args...]\n");
      return 3;
    }
    if (add_rule(ruleset_fd, argv[++i], handled) != 0) return 3;
  }
  if (!saw_separator || i >= argc) {
    fprintf(stderr, "usage: landlock-exec --rw <dir> [--rw <dir> ...] -- <command> [args...]\n");
    return 3;
  }

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    fprintf(stderr, "landlock-exec: PR_SET_NO_NEW_PRIVS: %s\n", strerror(errno));
    return 3;
  }
  if (syscall(SYS_landlock_restrict_self, ruleset_fd, 0) != 0) {
    fprintf(stderr, "landlock-exec: restrict_self: %s\n", strerror(errno));
    return 3;
  }
  close(ruleset_fd);

  execvp(argv[i], &argv[i]);
  fprintf(stderr, "landlock-exec: exec %s: %s\n", argv[i], strerror(errno));
  return 127;
}
