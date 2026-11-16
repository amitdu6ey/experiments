# Agent Instructions: hot-server-swap

## What this project is

A tool that swaps a live server for a new build inside one container with zero dropped requests: a supervisor process, a proxy that owns the public port, blue and green server processes, and later an authenticated agent that makes the changes.

## Stack

- Plain Java 21, standard library only, for the supervisor, proxy, load generator and stand-in server.
- No Maven or Gradle until the Spring Boot iterations (iteration 13 onward). Compile with `javac -d build ...`.
- This project is an exception to the repo-level preference for vanilla JS: it is a Java backend tool with no front end.

## How work proceeds

- One iteration at a time, in roadmap order. Do not start an iteration until the previous checkpoint passes.
- Every iteration adds `checkpoints/checkpoint-NN.sh`, which builds, runs its checks, and ends with `CHECKPOINT N: PASS` or `FAIL` and a matching exit code.
- A checkpoint must be able to fail. Where it claims zero failures, include a case that shows failures are detected.
- Before finishing an iteration, re-run every earlier checkpoint.
- Update the status table in `README.md` after each iteration.
- Update the matching `status` values in `site/map.js` in the same commit (`built`, `next`, `planned`, `given`, `parked`), and move `next` to the following iteration.

## Scope

- An AI agent already running on the server is assumed. This project builds the swap toolkit that agent calls: change a copy, build, test green, flip, bake, retire.
- Securing the agent's channel is parked. Do not build it unless asked, and do not describe it as solved.
- The swap happens on the server itself, through the proxy's pointer. Load-balancer and DNS switching are not part of this design.

## The project map

- `site/index.html` and `site/map.js` are a static page with no build step and no dependencies beyond a web font.
- The page is published by `.github/workflows/deploy-pokemon.yml`, which assembles every project's pages into one GitHub Pages site. That workflow is shared: change only the hot-server-swap lines in it.

## Conventions

- Servers bind loopback only and take their address from `SERVER_ADDRESS` and `SERVER_PORT`, the same variables Spring Boot reads.
- The release id comes from `LSA_RELEASE_ID`.
- Build output goes in `build/`, which is ignored by git.
- Checkpoint scripts unset `JAVA_TOOL_OPTIONS`, clean up their processes on exit, and write temporary files only under a `mktemp` directory.
