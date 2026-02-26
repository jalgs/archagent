---
name: clean-architecture
description: Defines architectural layers, the Dependency Rule, and how to detect
             layer violations. Reference for any agent reasoning about architecture.
triggers:
  - architectural layers
  - dependency rule
  - clean architecture
  - layer violation
  - depends on
alwaysInclude: false
---
 
# Clean Architecture — Reference
 
## The Four Canonical Layers
 
Use these labels when the project structure supports them. If it does not,
name layers descriptively and document why the canonical model does not apply.
 
**PRESENTATION**
User interaction or external system interface. Contains: CLI entry points, HTTP
controllers, UI components, event handlers, formatters, output renderers.
Rule: may call APPLICATION. Must never contain business logic.
 
**APPLICATION**
Use cases and orchestration. Contains: use case classes, command/query handlers,
application services, workflow coordinators.
Rule: may call DOMAIN and INFRASTRUCTURE. Must never contain UI or I/O logic directly.
 
**DOMAIN**
Pure business logic. Contains: entities, value objects, domain services, business
rules, domain events, repository interfaces (not implementations).
Rule: NO outgoing dependencies. DOMAIN must not import from any other layer,
any external library, or any framework. It is the innermost layer.
 
**INFRASTRUCTURE**
I/O, network, persistence, external libraries. Contains: repository implementations,
HTTP clients, file system access, database adapters, third-party SDK wrappers.
Rule: may call DOMAIN (to implement its interfaces). Must not call APPLICATION
or PRESENTATION.
 
---
 
## The Dependency Rule
 
Dependencies must point inward. The only allowed directions are:
 
```
PRESENTATION  →  APPLICATION
PRESENTATION  →  DOMAIN          (acceptable for simple read operations)
APPLICATION   →  DOMAIN
APPLICATION   →  INFRASTRUCTURE
INFRASTRUCTURE → DOMAIN
```
 
**DOMAIN never has outgoing arrows.** If a diagram shows `DOMAIN → anything`,
the direction is wrong. Retrace the actual import statements in source files.
 
**How to read a dependency diagram:**
Arrow `A → B` means: A imports B, A depends on B, A calls into B.
A change in B may require a change in A. B knows nothing about A.
 
---
 
## Detecting Layer Violations
 
A violation exists when a dependency arrow points outward (away from DOMAIN)
across a layer boundary it should not cross.
 
**Category 1 — Logic importing I/O directly**
A DOMAIN or APPLICATION file imports a concrete infrastructure class
(database client, HTTP library, file system module, external SDK) instead of
depending on an interface defined in DOMAIN.
Signal: import of `pg`, `axios`, `fs`, `configstore`, `redis`, or similar
inside a file classified as DOMAIN or APPLICATION.
 
**Category 2 — Use case mixing presentation concerns**
An APPLICATION file imports UI utilities: spinners, color formatters, prompt
libraries, console output helpers.
Signal: import of `chalk`, `ora`, `inquirer`, `enquirer`, `readline`, or similar
inside a command, use case, or service class.
 
**Category 3 — Framework coupling in inner layers**
A DOMAIN or APPLICATION file extends or is decorated by a framework class,
making the business logic untestable without instantiating the framework.
Signal: `extends BaseEntity`, `@Injectable()`, `@Controller()` or similar
framework annotations inside DOMAIN files.
 
---
 
## Common Misreadings
 
**"The config module is DOMAIN because it holds business data"**
Wrong. A module that reads from disk, environment variables, or a config store
is INFRASTRUCTURE regardless of what data it holds. The data schema may be DOMAIN;
the persistence mechanism is always INFRASTRUCTURE.
 
**"INFRASTRUCTURE → DOMAIN means DOMAIN depends on INFRASTRUCTURE"**
Wrong. The arrow means INFRASTRUCTURE depends on DOMAIN (implements its interfaces).
DOMAIN defines the contracts; INFRASTRUCTURE fulfills them.
 
**"A layer that everyone depends on must be at the top"**
Wrong. DOMAIN is at the center precisely because everyone depends on it —
that means everyone points toward it, not that it points toward them.