# Hooks

A hook is a script in this folder named for a point at which Evident runs it:
`before-start.sh`, `after-stop.sh`, `task-closed.sh`, `docs-written.sh` (any
extension). One that can be executed is run as it is; any other is run with
`sh`. Evident knows nothing of what a hook does, and shows each one's last run
under Settings › Workbench, where every point is listed with what its script
is given.

- `before-start`: before a prototype or a smoke test starts, once its database
  is built. Lines it prints as `NAME=value` are given to the start script. If
  it fails, nothing starts. Use it for what is particular to this app, such as
  who a tester is signed in as.
- `after-stop`: after a prototype or a smoke test is stopped.
- `task-closed`: when a task is closed.
- `docs-written`: when the docs agent's pages have passed their check and been
  committed here. Put `git push` in it to publish them.

None is written yet. This file is not a hook.
