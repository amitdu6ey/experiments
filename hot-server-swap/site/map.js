/*
 * The project as a tree of clouds. Each cloud opens into its own universe.
 *
 * Fields:
 *   id        short slug, unique among siblings (used in the URL)
 *   title     the cloud's name
 *   line      one sentence shown on the cloud
 *   status    built | next | planned | given | parked   (optional)
 *   ordered   true when the children are steps in a sequence
 *   happens   what happens here
 *   before    what must be true before moving on
 *   answer    what we do about it (used by the impact list)
 *   proof     the checkpoint that proves it
 *   kids      the clouds inside this one
 *   tally     false to hide the "N of M built" count for this cloud
 *
 * To record progress, change a status here. Nothing else needs editing.
 */
window.PROJECT_MAP = {
  id: "root",
  tally: false,
  title: "Hot Server Swap",
  line: "Change a live server's code and swap the JAR, with nothing dropped.",
  happens:
    "A server is running and taking traffic. A change is made in a copy, built into a new JAR, tested beside the live one, and swapped in by changing one pointer. The running JAR is never touched.",
  kids: [
    {
      id: "swap",
      title: "The swap",
      line: "Eight steps from a request to a new JAR serving traffic.",
      ordered: true,
      happens:
        "This is the whole process on one server. Users can only be affected from step 6 onward. Anything that goes wrong before that throws the new JAR away and leaves the live one exactly as it was.",
      kids: [
        {
          id: "arrives",
          title: "A change arrives",
          line: "Claude on the server receives a message.",
          status: "given",
          happens:
            "Claude is already running on the server and listening. One message in one chat can reach every server, so nobody logs in to ten machines. How Claude gets there and how it listens is taken as given; this project builds what Claude uses once it decides to act.",
          before: "Claude has decided the message applies to this server."
        },
        {
          id: "copy",
          title: "Change a copy",
          line: "The edit happens in a workspace, never in the running code.",
          status: "planned",
          happens:
            "The source is checked out into a workspace at the exact commit the live JAR was built from. The change is made there. The live server's files are read-only and are not part of the workspace.",
          before: "The change is recorded in git on its own branch.",
          proof: "Iteration 19: a one-line edit goes live with one command."
        },
        {
          id: "build",
          title: "Build the JAR",
          line: "Compile, run the unit tests, seal the result.",
          status: "planned",
          happens:
            "The project's build runs under CPU and memory limits so the live server keeps its share. The new JAR is copied into its own release directory, which is then made read-only.",
          before: "The build and unit tests exit clean, and the release is sealed.",
          proof: "Iteration 7: sealed files cannot be written. Iteration 19: the live server's latency stays in bounds during a build."
        },
        {
          id: "green",
          title: "Start green beside blue",
          line: "The new JAR starts on a second internal port.",
          status: "planned",
          happens:
            "Blue is the live JAR on internal port 9001. The new JAR, green, starts on 9002. Both run at once, but only blue receives users. Green starts in standby: its scheduled jobs and queue consumers are held back.",
          before: "There was memory for a second JVM, and green is listening.",
          proof: "Iteration 3: both answer on their own ports while the public port still answers from blue."
        },
        {
          id: "test",
          title: "Test green while blue serves",
          line: "Readiness, the integration suite, then a warm-up.",
          status: "planned",
          happens:
            "Green is tested on its internal port, where only the checks can reach it. Readiness must pass three times in a row. The integration suite then runs against the real running JAR, not just the code. The same requests warm the JVM so the first users do not meet a cold server.",
          before: "Every check passed. A green that fails here is discarded and users never knew.",
          proof: "Iteration 5: a green that never becomes ready is refused."
        },
        {
          id: "flip",
          title: "Flip the pointer",
          line: "One atomic write moves all new traffic to green.",
          status: "planned",
          ordered: true,
          happens:
            "The proxy holds one reference that says where requests go. The swap is changing that reference. It is the only step where live traffic changes, and it takes about as long as writing one value in memory.",
          before: "Green has served its first user request.",
          proof: "Iteration 4: 100 flips back and forth under load with 0 failures.",
          kids: [
            {
              id: "quiet-blue",
              title: "Quiet blue",
              line: "Blue stops its scheduled jobs and consumers.",
              status: "planned",
              happens:
                "Before traffic moves, blue is told to stop the work it does on its own: scheduled jobs and queue consumers. Blue keeps answering requests.",
              before: "Blue has confirmed its background work is stopped."
            },
            {
              id: "write",
              title: "One atomic write",
              line: "The reference changes from blue to green.",
              status: "planned",
              happens:
                "The proxy reads the reference at the start of every request. A request that already read blue finishes on blue. Every request that arrives after the write reads green. Nothing pauses and no lock is held. When a server listens on several ports, all of them live in one route table and move in the same write.",
              before: "New requests are reaching green."
            },
            {
              id: "wake-green",
              title: "Wake green",
              line: "Green starts its scheduled jobs and consumers.",
              status: "planned",
              happens:
                "Only now does green start the work it does on its own. For a few seconds neither server ran the scheduler, which is harmless. Both running it would do the same job twice.",
              before: "Green's background work is running."
            },
            {
              id: "finish",
              title: "Blue finishes its requests",
              line: "Requests already in flight complete on blue.",
              status: "planned",
              happens:
                "The proxy counts the requests still open on blue. They run to completion and their callers get normal responses. When the count reaches zero, blue is idle.",
              before: "Blue has no requests in flight.",
              proof: "Iteration 6: a 10 second request started before the flip finishes on blue."
            }
          ]
        },
        {
          id: "bake",
          title: "Bake",
          line: "Green is watched. Blue stays warm for instant rollback.",
          status: "planned",
          happens:
            "For a few minutes blue keeps running with no traffic. The proxy sees every request, so it measures green's error rate and latency itself. If green exits, fails readiness or gets worse than blue was, the pointer flips back. That rollback is the same single write.",
          before: "The bake window passed with no trigger.",
          proof: "Iteration 10: a green returning errors is rolled back in under a second, unattended."
        },
        {
          id: "retire",
          title: "Retire blue",
          line: "The old JAR shuts down and stays on disk.",
          status: "planned",
          happens:
            "Blue is asked to stop and given time to finish. If it hangs, it is killed. Its JAR stays in the release store as the previous release, so it can be brought back through the same eight steps.",
          before: "Blue's process has exited.",
          proof: "Iteration 6: a stuck blue is force-killed. Iteration 11: the previous release can be restored."
        }
      ]
    },

    {
      id: "box",
      title: "The box",
      line: "What runs on the server, and what each part owns.",
      happens:
        "One small Java program is the first process on the server. It runs the proxy and starts the application JARs as its children, so the server stays up while JARs come and go.",
      kids: [
        {
          id: "proxy",
          title: "Proxy",
          line: "Owns the public port for the server's whole life.",
          status: "built",
          happens:
            "Binds the public port once and never lets go. Forwards every request to whatever its target reference points at. Callers keep their connections to the proxy across a swap; only the proxy's own connections to the JARs change.",
          proof: "Iteration 1: the server behind the proxy was killed and restarted. The proxy kept the port, answered 502 in between, and was never restarted."
        },
        {
          id: "supervisor",
          title: "Supervisor",
          line: "Starts, watches and stops the application JARs.",
          status: "next",
          happens:
            "The first process on the server. It launches each JAR as a child on a loopback port, restarts one that dies, and records every step of a swap in a journal before acting on it.",
          proof: "Iteration 2: a killed child comes back, and its port cannot be reached from outside."
        },
        {
          id: "blue",
          title: "Blue",
          line: "The JAR serving users right now.",
          status: "planned",
          happens: "Listens on a loopback port only, so nothing can reach it except through the proxy."
        },
        {
          id: "green-jar",
          title: "Green",
          line: "The new JAR, running but not yet serving users.",
          status: "planned",
          happens: "Runs with the same environment as blue. Only its port, its release id and its standby flag differ."
        },
        {
          id: "releases",
          title: "Release store",
          line: "One sealed directory per build, and two pointers.",
          status: "planned",
          happens:
            "Each build lands in its own read-only directory named by time and commit. A pointer named current says which one is live, and previous says what to go back to. Pointers move with a single rename.",
          proof: "Iteration 7: three releases kept, pointers right, sealed files unwritable."
        },
        {
          id: "workspace",
          title: "Workspace",
          line: "The checkout where changes are made and built.",
          status: "planned",
          happens: "A git checkout separate from every release. It can be deleted and cloned again at any time."
        },
        {
          id: "claude",
          title: "Claude",
          line: "The interface. It decides to act and calls the swap.",
          status: "given",
          happens:
            "Claude running on the server is assumed. It receives the message, makes the edit in the workspace, and runs the swap. Securing that channel is a separate problem that this project has parked, and it has to be solved before any real production use."
        }
      ]
    },

    {
      id: "touches",
      title: "What the flip touches",
      line: "Everything a swap can disturb, and the answer for each.",
      happens:
        "A plain REST service, request in and response out, is the easy case: every request either finishes on the old JAR or starts on the new one. The harder cases are things that run on their own or run for a long time. This is the full list.",
      kids: [
        {
          id: "in-flight",
          title: "Requests in flight",
          line: "Open when the pointer changes.",
          status: "planned",
          happens: "A request was already being handled by blue at the moment of the flip.",
          answer: "It finishes on blue. The proxy sends new requests to green and lets open ones run to completion.",
          proof: "Iteration 6."
        },
        {
          id: "keep-alive",
          title: "Caller connections",
          line: "Browsers and load balancers hold connections open.",
          status: "planned",
          happens: "Callers reuse one connection for many requests and would notice if it were cut.",
          answer: "Their connection ends at the proxy, which never restarts. Nothing is cut.",
          proof: "Iteration 4."
        },
        {
          id: "ports",
          title: "Several ports",
          line: "A server that listens on more than one.",
          status: "planned",
          happens: "The app serves its API on one port and, say, an admin or metrics endpoint on another.",
          answer: "The proxy owns all of them. They sit in one route table that is replaced in a single write, so they move together and never disagree.",
          proof: "Iteration 21."
        },
        {
          id: "outbound",
          title: "Database and outbound connections",
          line: "Two JARs hold connections at once.",
          status: "planned",
          happens: "Green opens its own connection pool before the flip, while blue still holds its pool.",
          answer: "Green's pool is capped while it is in standby. The database's connection limit has to allow the overlap.",
          proof: "Iteration 15."
        },
        {
          id: "jobs",
          title: "Scheduled jobs",
          line: "Work that runs on a timer.",
          status: "planned",
          happens: "Two running JARs would each run the nightly job.",
          answer: "Green starts with jobs held. At the flip blue stops first, then green starts: a short gap, never an overlap.",
          proof: "Iteration 14: a once-a-second job never ticks twice across 100 swaps."
        },
        {
          id: "consumers",
          title: "Queue consumers",
          line: "Work pulled from a queue or topic.",
          status: "planned",
          happens: "Two consumers on the same queue could process a message twice or out of order.",
          answer: "Same as jobs: held on green, stopped on blue, then started on green.",
          proof: "Iteration 15: each message is consumed once across a swap."
        },
        {
          id: "streams",
          title: "Long-lived streams",
          line: "WebSocket, server-sent events, streaming responses.",
          status: "planned",
          happens: "A stream is tied to the JAR that accepted it and cannot move.",
          answer: "It stays on blue through the bake, then is closed with a going-away code. The client must reconnect, and lands on green.",
          proof: "Iteration 17."
        },
        {
          id: "memory-state",
          title: "State kept in memory",
          line: "Local caches and in-process sessions.",
          status: "planned",
          happens: "Green starts with empty memory. A session stored only inside blue is gone for green.",
          answer: "The app's job: sessions and caches that matter live in a database or Redis. The swap cannot carry memory across."
        },
        {
          id: "batches",
          title: "Long batch work",
          line: "A job that runs for minutes or hours.",
          status: "planned",
          happens: "A long job on blue may still be running when blue is due to retire.",
          answer: "The app's job: record progress so the work can resume. Blue is given a grace period, not an unlimited one."
        },
        {
          id: "files",
          title: "Files half-written",
          line: "A file being written when the JAR stops.",
          status: "planned",
          happens: "Blue is stopped part-way through writing a file that green will read.",
          answer: "The app's job: write to a temporary name and rename when complete, so a reader sees the whole file or none of it."
        },
        {
          id: "probes",
          title: "Health probes",
          line: "The platform checks the server is alive.",
          status: "planned",
          happens: "If a probe failed mid-swap, the platform might restart the server.",
          answer: "Probes hit the proxy, which answers from the active JAR. The server looks healthy throughout."
        },
        {
          id: "ram",
          title: "Memory for two JVMs",
          line: "Both JARs run at once for a few minutes.",
          status: "planned",
          happens: "A JVM sized as a share of the machine assumes it is alone. Two of them can exceed the limit.",
          answer: "Each JAR gets an explicit heap cap, and green is refused when there is not enough headroom.",
          proof: "Iteration 12: 20 swaps with no out-of-memory kill."
        },
        {
          id: "schema",
          title: "Database schema",
          line: "A change that needs a migration.",
          status: "planned",
          happens: "Green migrating the schema would change it underneath blue.",
          answer: "Migrations are switched off on green, and a change that touches migration files is refused. It goes through the normal pipeline.",
          proof: "Iteration 16."
        }
      ]
    },

    {
      id: "where",
      tally: false,
      title: "Why swap here",
      line: "One place to change, on the server itself.",
      happens:
        "The idea is general: put one entry in front of the server that says where it lives, and a swap becomes changing that entry. The question is only where the entry lives. Kept on the server, it works on a single machine with nothing else around it.",
      kids: [
        {
          id: "pointer",
          title: "A pointer on the server",
          line: "Chosen. One reference in the proxy's memory.",
          status: "built",
          happens: "The proxy reads the reference on every request, so a change takes effect at once. It works on any machine and needs no cloud service. The cost is one extra local hop per request.",
          proof: "Iteration 1 measured 2.5 ms added at the median on a cold JVM, which is higher than the design wants and will be measured again warm."
        },
        {
          id: "lb",
          title: "The load balancer",
          line: "A later option. Register the new target, drop the old.",
          status: "parked",
          happens: "The classic blue-green deployment. It is a clean switch and saves the proxy hop, but it needs a load balancer and its API, and the new server needs its own address."
        },
        {
          id: "dns",
          title: "DNS",
          line: "Rejected. Names are cached.",
          status: "parked",
          happens: "Clients and resolvers remember an address for seconds or minutes, so some traffic keeps going to the old server. There is no instant flip."
        },
        {
          id: "shared-port",
          title: "Two JARs on one port",
          line: "Rejected. Traffic splits during the overlap.",
          status: "parked",
          happens: "The kernel can let both bind the same port, but it then spreads connections across both, and connections queued on the old one are reset when it closes."
        },
        {
          id: "reload",
          title: "Reload inside the JVM",
          line: "Rejected. There is no clean way back.",
          status: "parked",
          happens: "Swapping classes in the running process avoids a second JVM, but it limits what can change, leaks class loaders over time, and cannot be rolled back cleanly."
        }
      ]
    },

    {
      id: "roadmap",
      title: "Roadmap",
      line: "Twenty-eight small iterations, each ending in a checkpoint.",
      happens:
        "Each iteration is a few minutes of build time and ends in a script that prints PASS or FAIL. An iteration starts only after the one before it has passed, and every earlier checkpoint is run again.",
      kids: [
        {
          id: "a",
          title: "Stage A: the core swap",
          line: "Iterations 0 to 9. One server, no framework.",
          ordered: true,
          happens: "Proves the swap itself with a plain-Java server standing in for the real app.",
          kids: [
            { id: "0", title: "Server and load test", line: "A stand-in server and a way to count dropped requests.", status: "built", proof: "1,000 of 1,000 requests answered. 658 failures reported when the server was killed, which shows the test can fail." },
            { id: "1", title: "Proxy on the public port", line: "Forwards to one fixed server.", status: "built", proof: "0 failures through the proxy. Body, query, headers and a 1 MB upload pass through. The server was killed and restarted behind a proxy that never stopped." },
            { id: "2", title: "Supervisor", line: "Starts the server as a child process.", status: "next", proof: "A killed child comes back. Its port is loopback-only." },
            { id: "3", title: "Green beside blue", line: "A second JAR on a second port.", status: "planned", proof: "Both answer. The public port still answers from blue." },
            { id: "4", title: "The atomic flip", line: "Switch the proxy's target under load.", status: "planned", proof: "100 flips with 0 failures." },
            { id: "5", title: "Test gate", line: "Readiness and the integration suite before a flip.", status: "planned", proof: "A green that fails its checks is refused." },
            { id: "6", title: "Drain and retire", line: "Let open requests finish, then stop blue.", status: "planned", proof: "A 10 second request finishes on blue. A stuck blue is force-killed." },
            { id: "7", title: "Release store", line: "Sealed directories and atomic pointers.", status: "planned", proof: "Three kept, pointers right, sealed files unwritable." },
            { id: "8", title: "Journal and lock", line: "One swap at a time, every step recorded.", status: "planned", proof: "A second swap gets busy. The journal replays to the same state." },
            { id: "9", title: "One command", line: "Start, test, flip, bake and retire in order.", status: "planned", proof: "A new JAR goes live under load with 0 failures." }
          ]
        },
        {
          id: "b",
          title: "Stage B: real applications",
          line: "Iterations 10 to 21. The edges that break real apps.",
          ordered: true,
          happens: "Where a demo becomes something a real Spring Boot service can survive.",
          kids: [
            { id: "10", title: "Bake and warm rollback", line: "Flip back automatically when green gets worse.", status: "planned", proof: "Rolled back in under a second, unattended." },
            { id: "11", title: "Cold rollback", line: "Bring back the previous release.", status: "planned", proof: "One command restores it after blue is retired." },
            { id: "12", title: "Memory budget", line: "Heap caps and a headroom check.", status: "planned", proof: "20 swaps with no out-of-memory kill." },
            { id: "13", title: "Real Spring Boot", line: "The starter, and a real app in place of the stand-in.", status: "planned", proof: "Every Stage A checkpoint passes against it." },
            { id: "14", title: "Scheduled jobs", line: "Standby, quiet and wake.", status: "planned", proof: "A once-a-second job never ticks twice across 100 swaps." },
            { id: "15", title: "Consumers and connections", line: "Queue listeners held, database pool capped.", status: "planned", proof: "Each message consumed once. Connections stay under the limit." },
            { id: "16", title: "Migration guard", line: "No schema changes from green.", status: "planned", proof: "A change touching migrations is refused." },
            { id: "17", title: "Long-lived streams", line: "Close cleanly so clients reconnect.", status: "planned", proof: "A WebSocket client reconnects onto green." },
            { id: "18", title: "One JAR, two roles", line: "Setup by configuration alone.", status: "planned", proof: "An unchanged start command yields supervisor plus app." },
            { id: "19", title: "Build on the server", line: "Workspace, limited build, sealed release.", status: "planned", proof: "A one-line edit goes live with one command." },
            { id: "20", title: "Crash recovery", line: "Kill the supervisor at every step.", status: "planned", proof: "The public port always comes back serving a good release." },
            { id: "21", title: "Several ports", line: "One route table, flipped as a whole.", status: "planned", proof: "Two ports switch together under load with 0 failures on either." }
          ]
        },
        {
          id: "c",
          title: "Stage C: many servers",
          line: "Iterations 22 to 27. Ten servers, one change.",
          ordered: true,
          happens: "One message reaches every server. They must end up on identical code, and they must not all flip at once.",
          kids: [
            { id: "22", title: "Git as the record", line: "Nothing runs that git does not have.", status: "planned", proof: "A failed push discards the change." },
            { id: "23", title: "Replay after a restart", line: "A restarted server returns to the wanted release.", status: "planned", proof: "It converges with no one involved." },
            { id: "24", title: "Identical JAR everywhere", line: "Build once, download elsewhere.", status: "planned", proof: "The JAR hash matches on every server." },
            { id: "25", title: "One first, then batches", line: "A canary before the rest.", status: "planned", proof: "A failure in the second batch stops the rollout and restores the first." },
            { id: "26", title: "Drift", line: "Notice servers that disagree.", status: "planned", proof: "A server changed by hand raises an alert." },
            { id: "27", title: "Chaos run", line: "Random kills during rollouts.", status: "planned", proof: "Failures stay in budget and every server ends on the same release." }
          ]
        },
        {
          id: "parked",
          title: "Parked",
          line: "Assumed for now, needed before production.",
          status: "parked",
          happens: "Claude on the server is taken as given, so the work around it waits. None of this is optional for a real production system.",
          kids: [
            { id: "channel", title: "Securing the channel", line: "Who may send a server a change.", status: "parked", happens: "Enrollment, signed messages, expiry and replay protection." },
            { id: "approval", title: "Approval and audit", line: "Who signed off, and a record of what happened.", status: "parked", happens: "A person approves before the flip, and every step is logged somewhere the server cannot alter." },
            { id: "limits", title: "Limits on the agent", line: "What Claude may touch on the server.", status: "parked", happens: "Narrow tools, a workspace boundary, and tests with hostile text planted in code and logs." }
          ]
        }
      ]
    },

    {
      id: "method",
      title: "How it is built",
      line: "A long-running AI workflow, one checkpoint at a time.",
      ordered: true,
      happens:
        "This project is built by a person and an AI model working across many sessions. The loop below is what keeps the work from drifting or having to be explained again each time.",
      kids: [
        { id: "design", title: "Design first", line: "Zoom in layer by layer before writing code.", happens: "Start with the whole system, then open one part at a time until each risky step is described at the level of ports, processes and files. This map is that design, made walkable." },
        { id: "slice", title: "Cut it small", line: "One iteration is a few minutes of building.", happens: "Each iteration takes one cloud from the design and makes it real. Anything too big is split before it starts." },
        { id: "checkpoint", title: "End on a checkpoint", line: "A script that prints PASS or FAIL.", happens: "Nothing is called done until its checkpoint passes. A checkpoint must be able to fail: where it claims zero dropped requests, it also shows that dropped requests are detected." },
        { id: "keep", title: "Keep every checkpoint", line: "Old ones run again every time.", happens: "A new step cannot quietly break an old one, because every earlier checkpoint is re-run before the iteration is finished." },
        { id: "record", title: "Record outside the session", line: "Repository, status, memory.", happens: "The design, the roadmap, the checkpoint scripts, the working rules for AI agents and the status all live in the repository. Decisions and preferences are carried between sessions in the assistant's project memory." },
        { id: "steer", title: "The person steers", line: "Continue, go deeper, or change direction.", happens: "After each checkpoint a person decides what happens next. The model builds; it does not choose the destination." }
      ]
    }
  ]
};
