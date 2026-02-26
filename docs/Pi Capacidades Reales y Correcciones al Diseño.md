# Pi: Capacidades Reales y Correcciones al Diseño
### Lo que el sistema puede implementar realmente, y lo que debe cambiar

---

## Lo que Pi puede hacer realmente

### El núcleo es más pequeño de lo que asumimos
Pi tiene cuatro herramientas built-in: `read`, `write`, `edit`, `bash`. Punto. Todo lo demás — sub-agentes, plan
mode, checkpoints, orquestación — son cosas que Pi **deliberadamente no incluye** y que el autor espera
que el usuario construya. Esta no es una limitación: es la filosofía central del diseño. La cita directa: *"Pi
ships with powerful defaults but skips features like sub-agents and plan mode. Ask pi to build what you
want."*

### Las cuatro formas de correr Pi

- **Interactive:** TUI completo, sesión persistente, para el humano
- **Print/JSON:** ejecución de un solo shot desde CLI, para scripts
- **RPC:** protocolo JSON sobre stdin/stdout, para integraciones de proceso a proceso
- **SDK:** `createAgentSession()` en TypeScript/Node, para embeber Pi en tu propia aplicación

La implicación crítica: **el Orchestrator de nuestro diseño no es una instancia de Pi — es una aplicación
TypeScript que usa el SDK de Pi para crear y gestionar múltiples sesiones de agentes especializados**. Esta
es la arquitectura correcta.

### El sistema de extensiones es real y potente
Las extensiones son módulos TypeScript con 20+ lifecycle hooks. Los más relevantes para nuestro diseño:

- `session_start` — cuando arranca la sesión
- `before_agent_start` — antes de cada turno del agente, **puede modificar el system prompt**
- `context` — puede modificar el historial de mensajes antes de cada turno
- `tool_call` — **puede bloquear o interceptar cualquier tool call antes de que se ejecute**
- `tool_result` — puede modificar el resultado de cualquier herramienta
- `agent_end` — cuando el agente termina su respuesta

Esto es exactamente lo que necesitamos para implementar `plan-guard`, `scope-enforcer`, y `checkpoint`.

### Skills: cómo funcionan realmente
Los skills son ficheros Markdown con frontmatter:
```
---


name: react-patterns
description: Best practices for React development
triggers:

- react
- jsx
- component
---
# React Patterns...
```

**La parte crítica que teníamos mal:** solo la `description` vive en el context window permanentemente. El
contenido completo del skill se carga on-demand cuando los triggers hacen match. Esto es "progressive
disclosure" — no se tiran todos los tokens al inicio.

Implicación: nuestra idea de "el Context Assembler ensambla un skill compuesto" es más compleja de lo que
pensábamos. El mecanismo real es: triggers para carga automática + `before_agent_start` hook para
inyección dinámica de contexto de `archbase/`.

### Sub-agentes: el mecanismo real
Pi no tiene sub-agentes built-in por diseño. El autor es explícito: *"You have zero visibility into what that sub-
agent does. It's a black box within a black box."*

Las opciones reales para multi-agente son:

1. **SDK:** el Orchestrator crea múltiples `createAgentSession()` y las coordina en TypeScript
2. **Bash + tmux:** un agente Pi puede lanzar otra instancia de Pi vía bash, con visibilidad total
3. **RPC:** protocolo JSON sobre stdin/stdout para coordinar procesos Pi independientes
4. **Extensión de sub-agentes:** construirla uno mismo (existen extensiones third-party que hacen esto)

Para nuestro caso, **el SDK es la opción correcta**: el Orchestrator es una aplicación TypeScript que
instancia agentes Pi, les pasa contexto, espera su output, y los coordina.

### AGENTS.md y SYSTEM.md: el mecanismo de contexto por proyecto
Pi ya tiene un mecanismo nativo para inyectar contexto de proyecto:

- **AGENTS.md:** instrucciones del proyecto cargadas al arranque desde `~/.pi/agent/`, directorios padre, y
el directorio actual
- **SYSTEM.md:** reemplaza o se añade al system prompt por proyecto

Esto significa que **`archbase/` ya tiene un mecanismo de integración nativo**. No necesitamos inventar
nada — `archbase/` puede exponer su contenido a través de AGENTS.md y SYSTEM.md que Pi carga
automáticamente.


### Sessions como árboles
Las sesiones son estructuras append-only con `id` y `parentId`, donde un puntero `leafId` marca la posición
actual. Esto permite branching retroactivo: ir a cualquier punto de la conversación y continuar desde ahí.
Todo se preserva en un único fichero JSONL.

Para nuestro diseño, esto significa que el Director puede hacer fork de cualquier sesión de cualquier agente
en cualquier momento — exactamente la observabilidad que necesitamos.

---

## Las Cinco Correcciones al Diseño

### Corrección 1: El Orchestrator es una aplicación TypeScript, no un agente Pi

**Antes:** diseñamos el Orchestrator como un agente Pi con un `orchestrator-role.skill` que coordina otros
agentes.

**Realidad:** el Orchestrator es una aplicación TypeScript que usa `createAgentSession()` del SDK. Crea
instancias de Pi especializadas, les pasa contexto vía `appendSystemPrompt`, espera sus outputs, gestiona
los checkpoints como Promises, y coordina el pipeline.

**Por qué importa:** la coordinación entre agentes es lógica TypeScript determinista, no razonamiento de un
LLM. Eso es más fiable, más testeable, y más barato en tokens. El Orchestrator no "piensa" — ejecuta el
pipeline. El razonamiento ocurre dentro de cada agente especializado.

**Consecuencia concreta:** el `orchestrator-role.skill` desaparece. En su lugar hay un fichero `orchestrator.ts`
con la lógica de pipeline. El Director interactúa con el Orchestrator a través de una UI (terminal, web, o la TUI
de Pi configurada para ello), no a través de lenguaje natural con un agente LLM.

---

### Corrección 2: El Context Assembler es código TypeScript + AGENTS.md, no un skill compuesto

**Antes:** diseñamos el Context Assembler como un componente que "ensambla skills" dinámicamente.

**Realidad:** Pi no permite ensamblar skills programáticamente de esa forma. Los skills tienen triggers
automáticos. Lo que sí permite es:

1. `appendSystemPrompt` en `createAgentSession()` → para inyectar el role del agente y las instrucciones
fijas
2. `before_agent_start` hook → para inyectar contexto dinámico de `archbase/` antes de cada turno


3. Skills con triggers → para conocimiento de dominio (SOLID, patrones, etc.) que se carga on-demand
4. AGENTS.md en el directorio del proyecto → para contexto base del proyecto

**El Context Assembler real** es una función TypeScript que, dado un rol y una zona, construye el string de
`appendSystemPrompt` leyendo los ficheros relevantes de `archbase/`, y registra el hook `before_agent_start`
con ese contenido. Es código, no magia.

## ---

### Corrección 3: plan-guard y scope-enforcer son interceptores de tool_call

**Antes:** los diseñamos como "extensions" de forma abstracta.

**Realidad (y buena noticia):** son exactamente lo que Pi permite. Un interceptor `tool_call` puede:

- Leer el nombre de la herramienta y sus argumentos antes de ejecutarla
- Bloquear la ejecución devolviendo un error al modelo
- Modificar los argumentos
- Registrar el intento

```
plan-guard: intercepta write/edit, verifica que el path empieza por "archbase/", si no → bloquea
scope-enforcer: intercepta write/edit, verifica el path contra la lista de ficheros del DDR activo
```

Ambos son ~30 líneas de TypeScript cada uno. Completamente implementables.

---

### Corrección 4: Los checkpoints son Promises en el Orchestrator

**Antes:** diseñamos checkpoints como un mecanismo abstracto de "pausa del sistema".

**Realidad:** en un Orchestrator TypeScript, un checkpoint es simplemente un `await` sobre una Promise que
el Director resuelve. El flujo del Orchestrator para cuando llega a un checkpoint, presenta el artefacto al
Director (en la UI), y espera a que el Director llame a `approve()`, `reject(feedback)`, o
`requestMoreAnalysis()`. El pipeline continúa cuando la Promise se resuelve.

Esto es programación asíncrona estándar. No requiere ningún mecanismo especial de Pi.

---


### Corrección 5: archbase/ se integra con AGENTS.md nativo de Pi

**Antes:** pensamos en `archbase/` como algo que las extensiones "cargan".

**Realidad:** Pi ya tiene el mecanismo correcto. Si ponemos un `AGENTS.md` en `archbase/` que incluye o
referencia el contenido clave, Pi lo carga automáticamente en cualquier sesión que se inicie desde el
directorio del proyecto. Podemos estructurar `archbase/` de forma que su contenido más crítico
(`CONSTRAINTS.md`, `CONVENTIONS.md`, resumen de `ARCH.md`) se exponga vía AGENTS.md sin trabajo
adicional.

Para el contenido más voluminoso (DDRs completos, análisis de zonas), el `before_agent_start` hook del
Orchestrator lo inyecta selectivamente según el agente y la tarea.

---

## La Arquitectura Técnica Real del Sistema

## ```

## ┌──────────────────────────────────────────────────┐

## │              DIRECTOR HUMANO                      │

│           (Terminal UI / Web UI)                  │
└──────────────────┬───────────────────────────────┘
│ inputs / approvals
▼
┌──────────────────────────────────────────────────┐
│           ORCHESTRATOR (TypeScript)               │
│ │
│  pipeline logic · checkpoint Promises             │
│  Context Assembler function                       │
│  Health Map reader · WORKFLOW_STATE writer        │
│ │
│  Uses Pi SDK:                                     │
│  createAgentSession({                             │
│    appendSystemPrompt: assembleContext(role,zone) │
│    sessionManager: SessionManager.inMemory()      │
│  })                                               │
└───┬──────────┬──────────┬──────────┬─────────────┘
│ │ │ │
▼ ▼ ▼ ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────────┐
│  Pi   │ │  Pi   │ │  Pi   │ │    Pi     │


│session│ │session│ │session│ │  session  │
│ │ │ │ │ │ │ │
│Under- │ │Decide │ │  Act  │ │  Verify   │
│stand  │ │ │ │ │ │ │
│ │ │ │ │ │ │ │
│+plan  │ │+plan  │ │+scope │ │+health    │
│ guard │ │ guard │ │enforc.│ │ tracker   │
└───────┘ └───────┘ └───────┘ └───────────┘
│ │ │ │
└──────────┴──────────┴──────────┘
│
archbase/
(AGENTS.md expone el núcleo,
Orchestrator inyecta el resto
vía before_agent_start)
```

## ---

## Lo que NO cambia

Las correcciones son de implementación, no de diseño conceptual. Todo lo que diseñamos sigue siendo
válido:

- Los cuatro roles (Understand, Decide, Act, Verify) — sin cambios
- El Health Map y sus cuatro dimensiones — sin cambios
- archbase/ y su modelo de propiedad — sin cambios
- Los flujos de extremo a extremo — sin cambios en lo observable
- Los skills de conocimiento (SOLID, patrones, clean architecture) — siguen siendo SKILL.md con triggers,
exactamente como Pi los usa
- Los checkpoints con tres opciones — el mecanismo cambia (Promise) pero la experiencia del Director es
idéntica

**La diferencia** es que ahora sabemos exactamente con qué API de Pi implementar cada pieza. Pasamos
de "diseño conceptual correcto" a "diseño implementable con herramientas reales".

---

## Implicaciones para el Siguiente Paso


El documento de "evolución y aprendizaje del sistema" que íbamos a diseñar ahora puede ser mucho más
concreto:

- "El sistema aprende" → el Orchestrator TypeScript actualiza ficheros de `archbase/` tras cada ciclo
- "El Health Map se actualiza" → el Verify agent escribe en `archbase/health/HEALTH_MAP.md` vía su
herramienta `write`, y el Orchestrator lee ese fichero antes del siguiente ciclo
- "Los checkpoints persisten" → el Orchestrator guarda el estado en
`archbase/workflow/WORKFLOW_STATE.md` antes de cualquier `await` de un checkpoint, para poder
reanudar si la sesión se interrumpe

Todo esto es código TypeScript + ficheros Markdown. Sin magia. Sin infraestructura compleja. Eso es
exactamente lo que Pi pretende ser.


