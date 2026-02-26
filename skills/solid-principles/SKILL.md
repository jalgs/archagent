---
name: solid-principles
description: Operationalized definitions of SOLID principles with detection
             criteria and common false positives. Reference for any agent
             evaluating code quality.
triggers:
  - SOLID
  - single responsibility
  - open closed
  - liskov
  - interface segregation
  - dependency inversion
  - SRP
  - OCP
  - LSP
  - ISP
  - DIP
alwaysInclude: false
---
 
# SOLID Principles — Operational Reference
 
## How to Apply These Principles
 
A SOLID violation is only a finding when it has an observable consequence
in the specific code being evaluated. The question is never "does this
technically violate the principle?" — it is "does this violation cause a
real problem here?"
 
For every potential finding, answer: *what breaks or becomes harder as a
direct result of this violation?* If you cannot answer concretely, skip it.
 
---
 
## S — Single Responsibility Principle
 
**Definition:** A module, class, or function should have one reason to change.
"Reason to change" means: one actor or stakeholder whose requirements drive
modifications to that unit.
 
**How to detect a real violation:**
- A class has methods that serve two distinct actors whose requirements
  could diverge independently (e.g., a class that handles both persistence
  logic and business rules — a schema change and a business rule change
  are independent reasons)
- A function does two things that could be called independently by different
  callers for different purposes
- A test for the class requires setting up two entirely different contexts
  (one for each responsibility)
 
**Observable consequence of a real violation:**
A change for one actor forces a re-test or re-deploy of functionality
used only by the other actor. The class becomes a coordination point
between unrelated concerns.
 
**Common false positives:**
- A class is "large" — size is not responsibility. A large class with one
  cohesive reason to change does not violate SRP.
- A class has many methods — method count is not responsibility.
- A utility class groups related helpers — grouping related functions
  in one module is not a violation.
 
---
 
## O — Open/Closed Principle
 
**Definition:** A module should be open for extension but closed for
modification. New behavior should be addable without editing existing code.
 
**How to detect a real violation:**
- Adding a new variant of behavior requires editing an existing `if/switch`
  in a class that has already been tested and deployed
- A function that is modified every time a new type, operation, or format
  is added to the system (the function grows indefinitely)
 
**Observable consequence:**
Every extension of the system touches code that was previously correct,
increasing regression risk and requiring re-testing of existing behavior.
 
**Common false positives:**
- Any use of `if` or `switch` — conditional logic is not inherently a
  violation. A switch that is unlikely to grow (e.g., mapping HTTP status
  codes) is not a violation.
- Modifying a class to fix a bug — OCP applies to extensions, not corrections.
- A class that is modified to add a new feature once — OCP becomes relevant
  when the same modification point is touched repeatedly as the system grows.
 
---
 
## L — Liskov Substitution Principle
 
**Definition:** A subtype must be substitutable for its base type without
altering the correctness of the program. Any code that uses the base type
must work correctly with any subtype.
 
**How to detect a real violation:**
- A subclass throws an exception for a method that the base class guarantees
  will succeed
- A subclass narrows a precondition (requires more than the base) or weakens
  a postcondition (guarantees less than the base)
- Code that uses the base type contains `instanceof` checks to handle a
  specific subtype differently — this is a direct signal that the subtype
  is not substitutable
 
**Observable consequence:**
Code that depends on the base type breaks at runtime when given a subtype,
or requires defensive checks that undermine polymorphism.
 
**Common false positives:**
- A subclass adds methods — adding behavior does not violate LSP.
- A subclass overrides a method with different but compatible behavior —
  LSP is about contracts, not implementation sameness.
- An interface implementation that only implements a subset of methods as
  no-ops — this may be an ISP violation, not necessarily LSP.
 
---
 
## I — Interface Segregation Principle
 
**Definition:** A client should not be forced to depend on methods it does
not use. Large interfaces should be split into smaller, role-specific ones.
 
**How to detect a real violation:**
- A class implements an interface but leaves one or more methods as empty
  stubs, `throw new Error('not implemented')`, or `return undefined`
  because the class does not need them
- Two different consumers of an interface use completely disjoint subsets
  of its methods — they are conceptually using two different interfaces
 
**Observable consequence:**
Implementations are forced to carry dead code. Changes to unused methods
trigger recompilation or testing of unaffected implementors.
 
**Common false positives:**
- An interface has many methods — size is not segregation. An interface
  where all methods are cohesively used by the same consumer is fine.
- Optional methods with default implementations — if the language supports
  default interface methods and they are genuinely optional, this is a
  design choice, not a violation.
 
---
 
## D — Dependency Inversion Principle
 
**Definition:** High-level modules should not depend on low-level modules.
Both should depend on abstractions. Abstractions should not depend on details.
 
**How to detect a real violation:**
- A high-level module (business logic, use case) directly instantiates
  a concrete low-level class (database client, HTTP client, file system)
  with `new ConcreteClass()` instead of depending on an interface
- A high-level module imports a concrete implementation from a lower layer
  directly, making it impossible to substitute the implementation in tests
 
**Observable consequence:**
The high-level module cannot be unit-tested without the low-level dependency
being present. Changing the low-level implementation requires modifying the
high-level module.
 
**Common false positives:**
- Using `new` for value objects or DTOs — DIP applies to services and
  dependencies, not to data structures.
- Depending on stable abstractions from third-party libraries — if the
  abstraction is stable and unlikely to change (e.g., standard library
  interfaces), the coupling risk is low and may be acceptable.
- Constructor injection where the injected type is already an interface —
  this is DIP done correctly, not a violation.
 
---
 
## Interaction Between Principles
 
Violations often cluster. A class that violates SRP (two responsibilities)
frequently also violates OCP (must be modified for each new variant of
either responsibility) and DIP (directly instantiates dependencies for
each responsibility).
 
When you find one violation, check whether related violations are present.
Report each separately with its own location and consequence — do not
collapse multiple violations into one finding.