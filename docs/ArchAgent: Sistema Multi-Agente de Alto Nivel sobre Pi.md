# ArchAgent: Sistema Multi-Agente de Alto Nivel sobre Pi
### Para programadores senior, arquitectos y analistas de software

---

## 1. El Problema Real que Queremos Resolver

Los agentes de coding actuales son, en esencia, **vibe coders muy rápidos**. Escriben código que funciona,
pero que ignora sistemáticamente:

- La arquitectura existente del repositorio (capas, módulos, contratos entre componentes)
- El estilo y convenciones establecidas (naming, estructura de directorios, patrones ya adoptados)
- Los principios SOLID y de Clean Code como restricciones de diseño, no como sugerencias
- La intención detrás de las decisiones arquitectónicas (¿por qué este patrón aquí y no allá?)
- Los invariantes del dominio y las reglas de negocio que el código debe preservar

El resultado es código que pasa los tests pero que **degrada la arquitectura** con cada iteración. Para un
arquitecto senior, esto es peor que no tener IA.

La hipótesis de este sistema es la contraria: **el humano opera como director técnico, y los agentes como
desarrolladores senior disciplinados** que antes de escribir una sola línea comprenden el contexto,
consultan las decisiones previas, y alinean su trabajo con la visión arquitectónica establecida.

## ---

## 2. Por Qué Pi es la Base Correcta

Pi tiene tres propiedades que lo hacen único para este propósito:

**Minimalismo extensible.** Su núcleo (read, write, edit, bash) es tan pequeño que no impone su propia
visión de cómo trabajar. Eso nos da espacio para construir encima nuestra propia filosofía de trabajo sin
luchar contra abstracciones ajenas.

**Skills como contexto inyectable.** Un `SKILL.md` se inyecta en el system prompt en tiempo de ejecución.
Esto significa que podemos inyectar restricciones arquitectónicas del proyecto actual como si fueran parte
del entrenamiento del agente para esa sesión. El agente no "recuerda" la arquitectura — la tiene delante como
ley.

**Multi-agente observable.** A diferencia de Claude Code donde los sub-agentes son cajas negras, Pi nos
permite ver la sesión entera de cada agente, intervenir, hacer fork de conversaciones. Eso es crítico cuando


queremos que un arquitecto humano supervise decisiones de diseño sin perder visibilidad.

## ---

## 3. Arquitectura del Sistema

## ```

## ┌─────────────────────────────────────────────────────────┐

## │                   DIRECTOR HUMANO                       │

│       (Arquitecto / Analista / Senior Developer)        │
│  Opera a nivel de intención, restricciones y revisión   │
└──────────────────────┬──────────────────────────────────┘
│
┌─────────────▼──────────────┐
│   ORCHESTRATOR AGENT        │
│   (Plan Mode + Messenger)   │
│  Descompone objetivos en    │
│  tareas y asigna agentes    │
└──┬─────────┬──────┬────────┘
│ │ │
┌───────▼─┐ ┌────▼──┐ ┌▼──────────┐
│SCOUT    │ │DESIGN │ │IMPLEMENT  │
│AGENT    │ │AGENT  │ │AGENT      │
└───────┬─┘ └────┬──┘ └─────┬─────┘
│ │ │
┌───────▼─────────▼───────────▼─────┐
│        REVIEW / AUDIT AGENT        │
│  (SOLID inspector + Pattern check) │
└────────────────────────────────────┘
│
┌─────────────▼──────────────┐
│   ARCHITECTURE KNOWLEDGE   │
│   BASE (archbase/)          │
│  ARCH.md · DECISIONS.md    │
│  PATTERNS.md · CONSTRAINTS │
└────────────────────────────┘
```

## ---

## 4. Los Agentes del Sistema


### 4.1 Scout Agent — *"Antes de tocar nada, entender todo"*

**Responsabilidad:** Exploración y comprensión arquitectónica del repositorio. Nunca modifica código.
Opera siempre en read-only mode.

**Qué produce:**

- **Mapa arquitectónico:** capas identificadas, contratos entre módulos, puntos de entrada y salida
- **Inventario de patrones:** qué patrones de diseño están en uso, dónde y con qué variantes
- **Mapa de dependencias:** acoplamiento entre módulos, violaciones ya existentes de la Dependency Rule
- **Hotspots de complejidad:** archivos con alta deuda técnica, funciones que hacen demasiado, god
classes
- **Vocabulary del dominio:** términos del dominio identificados en el código (ubiquitous language implícito)

**Cómo lo hace en Pi:**

- Skill con instrucciones de exploración sistemática (estructura de directorios → interfaces públicas →
implementaciones → tests)
- Plan mode activado para que no pueda escribir aunque quiera
- La salida se escribe en `archbase/ARCH.md` — un artefacto vivo del repositorio

**Cuándo se activa:**

- La primera vez que el sistema entra en un nuevo repositorio
- Cuando el orchestrator detecta que han pasado N días o N commits desde el último análisis
- A petición explícita del arquitecto humano

---

### 4.2 Design Agent — *"La decisión antes que el código"*

**Responsabilidad:** Recibir un objetivo de alto nivel y traducirlo en una decisión de diseño explícita,
documentada y revisable. **No escribe código de producción.** Escribe diseño.

**Qué produce:**

- **Design Decision Record (DDR):** análisis de opciones, trade-offs, decisión tomada, razón por la que se
descartaron las alternativas
- **Contrato de interfaz:** qué firma/tipo/protocolo cumplirá la nueva pieza
- **Plan de integración:** cómo encaja en la arquitectura existente sin romper la Dependency Rule
- **Identificación de patrones aplicables:** ¿Repository? ¿Strategy? ¿Command? ¿Adapter? Con justificación
- **Lista de invariantes que el diseño debe preservar**

**Cómo lo hace en Pi:**


- Skill cargado con `ARCH.md`, `DECISIONS.md` y `PATTERNS.md` del repositorio actual
- Skill con catálogo de patrones GoF, Enterprise Patterns, Clean Architecture patterns
- Skill con principios SOLID como criterios de evaluación explícitos
- Plan mode activo durante la fase de exploración; se desactiva solo para escribir el DDR en
`archbase/DECISIONS/`
- El humano revisa y aprueba el DDR antes de continuar el flujo

**El DDR como artefacto clave:** Este es el contrato que rige al Implementation Agent. No es un to-do list —
es una especificación de diseño con restricciones explícitas.

---

### 4.3 Implementation Agent — *"El mejor desarrollador senior que sigue un diseño*"

**Responsabilidad:** Implementar exactamente lo que el DDR especifica, ni más ni menos. Opera con el
contexto arquitectónico completo inyectado.

**Qué produce:**

- Código de producción alineado con el diseño
- Tests que verifican el contrato especificado (no solo la implementación)
- Actualización del `ARCH.md` si la implementación aporta nueva información relevante

**Cómo lo hace en Pi:**

- Skill cargado con el DDR aprobado como restricción principal
- Skill con convenciones de código del proyecto (naming, estructura, estilo)
- Skill con instrucciones para **no resolver** cosas fuera del scope del DDR (si descubre algo que requiere
otra decisión, para y reporta)
- Extension que intercepta writes y verifica que los archivos modificados son los que el DDR autorizó
- Extension que registra qué archivos tocó para el Review Agent

**Restricción crítica de diseño:** El Implementation Agent tiene prohibido explícitamente tomar decisiones
de diseño. Si durante la implementación descubre que el DDR es insuficiente o contradictorio, detiene la tarea
y escala al Director Humano, que puede re-activar el Design Agent.

---

### 4.4 Review / Audit Agent — *"El revisor implacable que no se cansa"*

**Responsabilidad:** Auditar la implementación resultante contra el DDR, contra `ARCH.md`, y contra
principios de calidad. No es un linter — es una revisión arquitectónica.


**Dimensiones de revisión:**

1. **Conformidad con el DDR:** ¿Se implementó lo que se diseñó? ¿Se respetaron las interfaces
especificadas?
2. **SOLID check:**
- SRP: ¿alguna clase/función hace más de una cosa? ¿El motivo de cambio es único?
- OCP: ¿se añadió comportamiento modificando lógica existente en vez de extenderla?
- LSP: ¿las implementaciones cumplen el contrato de sus abstracciones?
- ISP: ¿las interfaces tienen métodos que algún cliente no usa?
- DIP: ¿los módulos de alto nivel dependen de abstracciones o de implementaciones?
3. **Dependency Rule:** ¿el código nuevo introduce dependencias que violan la dirección de las capas?
4. **Clean Code check:** naming, tamaño de funciones, comentarios innecesarios, código duplicado,
abstraction leaks
5. **Pattern integrity:** si se usó un patrón, ¿se usó correctamente? ¿La variante elegida es la adecuada?
6. **Test quality:** ¿los tests prueban el comportamiento o la implementación? ¿Hay tests que fallarían si se
refactoriza sin cambiar comportamiento?

**Qué produce:**

- **Audit Report:** puntuación por dimensión, hallazgos concretos con localización (archivo:línea), severidad
- **Blocking issues:** problemas que impiden merge (violaciones arquitectónicas graves)
- **Advisory issues:** deuda técnica aceptable que debe registrarse en `archbase/DEBT.md`
- **Sugerencias de refactor** que el Director Humano puede encolar como nuevas tareas

## ---

### 4.5 Orchestrator Agent — *"El director de orquesta que no toca ningún instrumento"*

**Responsabilidad:** Recibir objetivos de alto nivel del Director Humano y descomponerlos en flujos de
agentes. Es el único agente con visibilidad total del estado del sistema.

**Cómo lo hace:**

- Usa `pi-messenger` (o equivalente) para coordinar los agentes especializados
- Mantiene un `WORKFLOW_STATE.md` con el estado actual del flujo (qué agente está activo, qué está
pendiente de revisión humana, qué está bloqueado)
- Decide qué agentes corren en paralelo (varios Implementation Agents en módulos no solapados) y cuáles
deben ser secuenciales (Scout → Design → Implement → Review)
- Gestiona los puntos de control donde el humano debe intervenir antes de continuar

## ---

## 5. La Architecture Knowledge Base (archbase/)


Este directorio es el cerebro del sistema. No es generado una sola vez y olvidado — es un artefacto vivo que
los agentes leen y escriben de forma coordinada.

```
archbase/
├── ARCH.md              # Mapa arquitectónico del sistema (generado por Scout)
├── PATTERNS.md          # Catálogo de patrones en uso en este repo concreto
├── CONVENTIONS.md       # Convenciones de código, naming, estructura
├── CONSTRAINTS.md       # Restricciones explícitas ("nunca usar X", "siempre ...")
├── DECISIONS/
│ ├── DDR-001.md       # Design Decision Records históricos y activos
│ ├── DDR-002.md
│ └── ...
├── DEBT.md              # Deuda técnica registrada y priorizada
└── VOCABULARY.md        # Ubiquitous language del dominio
```

**Propiedad clave:** cada skill especializado de cada agente carga los ficheros de `archbase/` relevantes
para su tarea. El Scout actualiza `ARCH.md`. El Design Agent escribe en `DECISIONS/`. El Review Agent
alimenta `DEBT.md`. El Director Humano edita `CONSTRAINTS.md` y `VOCABULARY.md` a mano — esos
ficheros son su palanca de control sobre el sistema.

## ---

## 6. Flujos Agénticos Principales

### Flujo A: Nueva Feature de Zero
```
Director: "Necesitamos añadir notificaciones por email cuando un pedido cambie de estado"
│
▼
Orchestrator descompone en tareas
│
├─► Scout (si ARCH.md tiene más de 7 días o el dominio de notificaciones es nuevo)
│ └─► Actualiza ARCH.md con lo que sabe de la capa de dominio de pedidos
│
├─► Design Agent
│ ├─► Lee ARCH.md, PATTERNS.md, DECISIONS/ previas relevantes
│ ├─► Analiza opciones: Observer en dominio vs Domain Event vs Outbox Pattern
│ ├─► Escribe DDR-023.md con la decisión y sus trade-offs
│ └─► [CHECKPOINT HUMANO] → Director revisa y aprueba DDR


## │

├─► Implementation Agent (si DDR aprobado)
│ ├─► Carga DDR-023.md como restricción principal
│ └─► Implementa dentro del scope autorizado
│
└─► Review Agent
├─► Audita contra DDR, ARCH.md, SOLID, Clean Code
├─► [CHECKPOINT HUMANO si hay blocking issues]
└─► Actualiza DEBT.md con advisory issues
```

### Flujo B: Refactor de Módulo con Deuda
```
Director: "El módulo de autenticación tiene demasiada responsabilidad, refactoriza"
│
▼
Scout (foco en módulo de auth) → análisis específico
│
Design Agent → diseño del módulo objetivo (cómo debería ser)
+ análisis de gap (diferencia entre actual y objetivo)
+ plan de refactor incremental (Baby Steps que no rompan nada)
│
[CHECKPOINT HUMANO] → Director decide alcance y prioridad
│
Implementation Agent (por pasos del plan aprobado)
│
Review Agent (verifica cada paso antes del siguiente)
```

### Flujo C: Code Review de un PR
```
Director: "Revisa este PR antes de que lo mergee"
│
Review Agent (modo PR)
├─► Lee diff del PR
├─► Carga ARCH.md y DECISIONS/ relevantes
├─► Audita en todas las dimensiones
└─► Produce Audit Report con blocking / advisory
```

### Flujo D: Análisis de Deuda Técnica


## ```

Director: "¿Cuál es la situación real de la deuda técnica del proyecto?"
│
Scout (análisis completo) → mapa actualizado
│
Review Agent (modo audit global, sin implementación)
├─► Evalúa todos los módulos contra ARCH.md y principios
└─► Produce reporte priorizado de deuda con impacto estimado
```

---

## 7. Skills Fundamentales del Sistema

Los skills son ficheros Markdown inyectados en el prompt. Estos son los que el sistema necesita:

**Skills de Conocimiento (reutilizables entre proyectos):**

- `clean-architecture.skill.md` — capas, reglas de dependencia, entidades/use cases/adapters/frameworks
- `solid-principles.skill.md` — definición operativa de cada principio con ejemplos de violación
- `design-patterns-gof.skill.md` — catálogo de patrones con cuándo usar cada uno y cuándo no
- `enterprise-patterns.skill.md` — Repository, Unit of Work, Domain Events, Outbox, Saga, etc.
- `clean-code.skill.md` — naming, tamaño de funciones, comentarios, abstracción, DRY vs premature
abstraction

**Skills de Contexto (específicos del proyecto, en archbase/):**

- `arch-context.skill.md` → wrapper que carga `ARCH.md` y `CONSTRAINTS.md`
- `patterns-in-use.skill.md` → wrapper que carga `PATTERNS.md` y `CONVENTIONS.md`
- `active-ddr.skill.md` → carga el DDR activo para el Implementation Agent

**Skills de Rol (definen el comportamiento del agente):**

- `scout-role.skill.md` — instrucciones de exploración sistemática, formato de output
- `design-role.skill.md` — instrucciones de análisis de opciones, formato del DDR
- `implement-role.skill.md` — restricciones de scope, cuándo parar y escalar
- `review-role.skill.md` — dimensiones de revisión, escala de severidad, formato del Audit Report

---

## 8. Extensions Clave del Sistema

Las extensions son TypeScript que engancha en el ciclo de vida del agente:


- **`plan-guard.extension`** — intercepta tool calls de escritura en agentes que deben ser read-only. El Scout y
el Design Agent (en fase de exploración) nunca pueden escribir fuera de `archbase/`
- **`scope-enforcer.extension`** — para el Implementation Agent, verifica que cada `write` o `edit` es sobre un
archivo que el DDR activo autoriza explícitamente. Si no, para la ejecución y requiere confirmación humana
- **`archbase-sync.extension`** — detecta cuando `ARCH.md` o `DECISIONS/` han sido modificados y notifica
a los agentes activos que relean su contexto
- **`checkpoint.extension`** — implementa los puntos de control humanos. Pausa el flujo, presenta el
artefacto pendiente de revisión al Director, y espera aprobación o rechazo con comentarios antes de
continuar
- **`debt-tracker.extension`** — en el Review Agent, mantiene un índice estructurado de `DEBT.md` con
búsqueda por módulo, tipo y prioridad
- **`context-budget.extension`** — monitoriza el uso de contexto de cada agente. Cuando se acerca al límite,
compacta la historia preservando el DDR activo y el `ARCH.md` (los invariantes) y descartando el
razonamiento intermedio

---

## 9. Principios de Diseño del Propio Sistema

El sistema debe predicar con el ejemplo. Su propia arquitectura debe respetar lo que enseña:

**Separación de concerns entre agentes:** cada agente tiene una sola responsabilidad. El Implementation
Agent no diseña. El Design Agent no implementa. El Review Agent no propone la corrección — solo
diagnostica.

**La architecture knowledge base como Single Source of Truth:** ningún agente toma decisiones de
memoria. Todo lo que importa está en `archbase/`. Si no está ahí, no existe como restricción.

**Los checkpoints humanos como first-class citizens:** no son un fallback de seguridad — son parte del flujo
normal. El Director Humano es el único que puede aprobar un DDR o aceptar un Audit Report con blocking
issues. Esto evita que el sistema "autopilote" sobre decisiones que requieren juicio senior.

**Observabilidad total:** aprovechando que Pi permite ver la sesión completa de cada agente, el Director
Humano puede leer el razonamiento de cada agente, no solo su output. Si el Design Agent llegó a una
conclusión incorrecta, el Director puede ver dónde se equivocó y añadir esa restricción al
`CONSTRAINTS.md` para que no se repita.


**El sistema se extiende a sí mismo:** si el Director quiere un nuevo tipo de agente (por ejemplo, un "Domain
Modeler" especializado en extraer y modelar el dominio), puede pedirle al sistema que analice los skills
existentes y construya el nuevo agente siguiendo los mismos patrones. El meta-agente que mejor conoce la
arquitectura del sistema es Pi apuntado a su propia `archbase/`.

## ---

## 10. Hoja de Ruta de Implementación (Sin Código)

**Fase 0 — Fundamentos (1-2 semanas)**
Construir el Scout Agent y el esqueleto de `archbase/`. Validar que el sistema puede explorar un repositorio
real y producir un `ARCH.md` útil. El Director Humano edita y refina ese output hasta que sea un artefacto en
el que confía.

**Fase 1 — El ciclo de diseño (2-3 semanas)**
Construir el Design Agent con el formato DDR. Probar el flujo Scout → Design → checkpoint humano con un
caso de uso real. El objetivo de esta fase es que el DDR produzca un documento que cualquier desarrollador
senior reconocería como un buen diseño previo a la implementación.

**Fase 2 — Implementación gobernada (2-3 semanas)**
Construir el Implementation Agent con el `scope-enforcer`. Completar el flujo completo con un feature real.
Medir cuántas veces el agente intenta salir del scope definido en el DDR — eso da información sobre la
calidad de los DDRs.

**Fase 3 — El revisor (1-2 semanas)**
Construir el Review Agent con todas sus dimensiones. Pasarlo sobre código existente antes de integrarlo en
el flujo. Calibrar la escala de severidad con criterio del equipo.

**Fase 4 — Orquestación (2-3 semanas)**
Construir el Orchestrator. Conectar todos los agentes vía pi-messenger. Implementar los flujos A, B, C y D
completos. Ajustar los checkpoints según la experiencia de las fases anteriores.

**Fase 5 — Maduración (continua)**
El sistema aprende del uso: cada DDR aprobado enriquece `DECISIONS/`, cada Audit Report alimenta
`DEBT.md`, el `ARCH.md` se mantiene vivo. Con el tiempo, la architecture knowledge base se vuelve el activo
más valioso del repositorio.


