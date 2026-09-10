# __PROJECT_NAME__

A BackTS native HTTP application. Requires Node 24+, clang and the platform SDK.
The currently validated environment is macOS ARM64.

```sh
__PM__ exec backts doctor
__PM__ run dev
```

Open http://localhost:3000/ or /health. Edit src/main.ts to rebuild and restart.
In-memory state is reset on restart. Compilation keeps the current service running;
a failed build preserves it until the next successful edit. A successful build allows
the old service up to one second to exit before replacing it. In-flight requests may
be interrupted during this development restart.
Use Ctrl+C to stop the development process and its child processes.
To use another port: `npm exec -- backts dev -- 3100` or `pnpm exec backts dev -- 3100`.

```sh
__PM__ run typecheck
__PM__ run analyze
__PM__ run build
__PM__ run start
```

The native executable is .scriptc/app. Distribute it for the verified target platform;
Node and development dependencies are not needed to run that executable.
Keep external static resources alongside it if you add them. This is an experimental
framework; compilation supports static TS imports through public package exports,
not arbitrary JavaScript packages, dynamic imports, or tsconfig path aliases.

If installation was skipped or failed, run `__PM__ install --ignore-scripts` first.
