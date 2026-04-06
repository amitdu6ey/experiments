# codebase-index

A zero-dependency CLI that scans any project and generates a `CODEBASE_INDEX.md` — a compact, structured map that AI tools (GitHub Copilot, Claude, etc.) can read to navigate directly to the parts that matter, without scanning every file.

**Primary focus: Java Spring Boot** — extracts REST endpoints, component layers (Controller/Service/Repository/Entity), Spring annotations, pom.xml, and application config automatically.

## Quickstart (no install)

```bash
# Download and run in one line
curl -s https://raw.githubusercontent.com/amitdu6ey/experiments/main/codebase-index/index.js \
  -o codebase-index.js && node codebase-index.js /path/to/your/project
```

Or clone and run:

```bash
git clone https://github.com/amitdu6ey/experiments.git
node experiments/codebase-index/index.js /path/to/your/project
```

Or install globally:

```bash
npm install -g /path/to/experiments/codebase-index
codebase-index /path/to/your/project
```

## What It Generates

Running the CLI produces `CODEBASE_INDEX.md` in your project root. Open it in your editor and Copilot reads it as context.

### Spring Boot output example

```
## Token Cost Estimate
| Full project scan | ~42,800 tokens | baseline |
| This index        |  ~1,240 tokens | 97.1% saved |

## Spring Boot Project
### Build Info
- Spring Boot: 3.2.1 · Java: 17
- Key deps: spring-boot-starter-web, spring-boot-starter-data-jpa, lombok

### Application Config
| server.port | 8080 |
| spring.datasource.url | jdbc:mysql://localhost/mydb |

### REST API Routes
| GET  | /api/users        | UserController.getAll   |
| GET  | /api/users/{id}   | UserController.getById  |
| POST | /api/users        | UserController.create   |
| DEL  | /api/users/{id}   | UserController.delete   |

### Components by Layer
#### 🌐 Controller  — UserController, AuthController
#### ⚙️ Service     — UserService, EmailService
#### 🗄️ Repository  — UserRepository, OrderRepository
#### 📦 Entity      — User, Order, Product
#### ⚡ Configuration — SecurityConfig, CorsConfig
```

## Flagging Important Code

Add `@flag` annotations to mark critical sections — they appear in a dedicated table:

```java
// @flag: main authentication entry point
public class AuthController { ... }

// @flag: critical — do not modify rate limit without review
private static final int RATE_LIMIT = 100;
```

```python
# @flag: core pricing logic
def calculate_pricing(order): ...
```

The index collects all flags with file path + line number so Copilot can jump straight to them.

## Token Cost Reduction

The CLI shows token savings in both the terminal and the generated index:

```
Token savings: 97.1% — index is ~1,240 tokens vs ~42,800 for full scan
```

This directly reduces cost when using pay-per-token APIs and prevents context window overflow on large projects.

## Supported Languages

| Language | Symbols extracted | Endpoints |
|----------|-------------------|-----------|
| **Java / Spring Boot** | Classes, interfaces, methods, Spring annotations | REST routes from `@GetMapping`, `@PostMapping`, etc. |
| JavaScript / TypeScript | Functions, classes, exports | — |
| Python | Functions, classes (top-level) | — |
| Go | Functions, types | — |
| Ruby | Methods, classes, modules | — |
| Rust | Functions, structs, enums, traits | — |
| `pom.xml` | Spring Boot version, Java version, deps | — |
| `application.properties/.yml` | Key config values | — |

## Requirements

- Node.js v14 or higher
- No npm dependencies — uses only built-in `fs` and `path`
