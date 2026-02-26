---
name: design-patterns
description: Classification criteria for GoF design patterns and common
             misclassifications. Reference for any agent identifying or
             evaluating patterns in code.
triggers:
  - design pattern
  - identify pattern
  - pattern classification
  - strategy pattern
  - factory pattern
  - observer pattern
alwaysInclude: false
---
 
# Design Patterns — Classification Reference
 
## How to Classify a Pattern
 
A pattern is only present when **all its defining conditions are simultaneously met**
in the code. Finding one condition is not enough. If in doubt, do not classify —
note the structural similarity and mark it as CONFIDENCE: LOW.
 
Never name a pattern based on what the code tries to do or what a comment says.
Name it based on the actual structure you can verify in the source files.
 
---
 
## Patterns and Their Verification Criteria
 
### Command
**All three must be present:**
1. An interface or abstract class with an `execute()` (or equivalent) method
2. Concrete classes that implement that interface, each encapsulating one operation
3. A caller that invokes the command through the interface, not the concrete class
 
**Evidence to cite:** the interface definition file + one concrete implementor +
the caller that holds a reference to the interface type.
 
### Composite
**All three must be present:**
1. A common interface or base class shared by both leaf and composite objects
2. A composite class that contains a collection of the common interface type
3. The composite delegates operations to its children
 
**Evidence to cite:** the common interface + the composite class showing the
collection field + at least one leaf class.
 
### Strategy
**All three must be present:**
1. A family of classes implementing the same interface, each with a different algorithm
2. A context class that holds a reference to the interface (not a concrete class)
3. The strategy can be substituted at runtime without changing the context
 
**Evidence to cite:** the shared interface + two distinct implementations +
the context class showing the interface-typed field.
 
### Factory Method
**All three must be present:**
1. A creator class or function with a method whose return type is an abstraction
2. The creator does not know which concrete class it will instantiate — subclasses
   or parameters decide
3. Callers depend on the abstraction returned, not the concrete type
 
**Evidence to cite:** the creator method signature + one concrete product class +
a caller that uses only the abstract return type.
 
### Observer
**All three must be present:**
1. A subject that maintains a list of observers and notifies them on state change
2. An observer interface with a notification method (`update`, `notify`, or equivalent)
3. Observers register and deregister dynamically at runtime
 
**Evidence to cite:** the subject's subscriber list field + the notification call +
the observer interface.
 
### Decorator
**All three must be present:**
1. A base interface or abstract class
2. A decorator class that implements the same interface AND holds a reference to it
3. The decorator adds behavior before or after delegating to the wrapped object
 
**Evidence to cite:** the interface + the decorator class showing both the interface
implementation and the wrapped reference.
 
---
 
## Common Misclassifications
 
### Constructor injection ≠ Strategy
**Why it happens:** a class accepts interface-typed parameters in its constructor.
That looks like Strategy because it uses abstractions.
 
**Why it is wrong:** Strategy requires a context that *delegates an algorithm* to
the injected object and allows *runtime substitution*. Constructor injection that
simply wires dependencies at startup is Dependency Injection, regardless of whether
the parameter type is an interface.
 
**Classification rule:** if the injected object is used as a collaborator (called
for its services) rather than as an interchangeable algorithm, it is DI, not Strategy.
 
### Abstract base class ≠ Template Method
Template Method requires the base class to define a skeleton algorithm with specific
steps that subclasses override. A base class that only shares common fields or
utility methods is inheritance, not Template Method.
 
### Event emitter ≠ Observer
Many frameworks (Node.js EventEmitter, DOM events) implement a pub/sub mechanism
that resembles Observer but differs in key ways: observers do not register on a
typed subject interface, and the subscription is string-based. Classify these
as Event Emitter or Pub/Sub, not Observer, unless the code explicitly implements
the Observer interface structure described above.
 
### Passing a function ≠ Strategy
In functional languages or JavaScript/TypeScript, passing a callback or higher-order
function is idiomatic and does not constitute the Strategy pattern. Strategy implies
a family of named, swappable algorithm objects. A single callback parameter is
just a function argument.
 
---
 
## When Not to Name a Pattern
 
If the code has a structural similarity to a pattern but does not meet all criteria,
use a descriptive phrase instead of a pattern name:
 
- "Command-like structure without a unified interface" — not Command
- "Constructor injection with interface types" — not Strategy
- "Hierarchical composition without a shared interface" — not Composite
 
Inventing a pattern name where one does not strictly apply misleads downstream agents
that will make design decisions based on this analysis.