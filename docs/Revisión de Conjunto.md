# Revisión de Conjunto
### Auditoría de coherencia, consistencia e implementabilidad con Pi

---

## Metodología

Esta revisión examina el diseño completo en cuatro dimensiones:

1. **Coherencia interna:** ¿las piezas se contradicen entre sí?
2. **Alineación con Pi real:** ¿todo lo que prometemos puede implementarse con el SDK, extensiones y skills
de Pi tal como existen?
3. **Gaps:** ¿hay preguntas críticas sin respuesta?
4. **Veredicto de implementabilidad:** ¿por dónde se empieza y qué riesgo tiene cada pieza?

---

## 1. El Mapa Completo del Sistema

Antes de buscar problemas, conviene tener la foto completa en una sola vista.

```
┌─────────────────────────────────────────────────────────────────┐
│                      DIRECTOR HUMANO                            │
│           Expresa intención · Aprueba artefactos                │
│           Edita CONSTRAINTS.md y CONVENTIONS.md                 │
└──────────────────────────┬──────────────────────────────────────┘
│ UI (ver Gap #1)
▼
┌─────────────────────────────────────────────────────────────────┐
│                ORCHESTRATOR (TypeScript)                        │
│ │
│  Lee HEALTH_MAP.md → Pipeline Configurator                      │
│  Context Assembler (appendSystemPrompt por agente+zona)         │
│  Checkpoint Promises (pausa · presenta artefacto · espera)      │
│  postCycleUpdate (actualiza archbase/ tras cada ciclo)          │
│  Git delta detector (stale zones)                               │
│  Feedback extractor (CONSTRAINTS.md proposals)                  │
└───┬──────────────┬───────────────┬──────────────┬──────────────┘
│ │ │ │


## ▼ ▼ ▼ ▼

Pi session     Pi session      Pi session    Pi session
UNDERSTAND     DECIDE          ACT           VERIFY
+plan-guard    +plan-guard     +scope-enf.   +health-tracker
+arch-integr.   +ctx-budget   +arch-integrity
+session-obs  +session-obs
│ │ │ │
└──────────────┴───────────────┴──────────────┘
│
archbase/
┌────────────────┼─────────────────┐
knowledge/       health/          decisions/
ARCH.md          HEALTH_MAP.md    DDR-NNN.md
CONSTRAINTS.md   DEBT.md          _index.md
CONVENTIONS.md   METRICS.md
PATTERNS.md      zones/
VOCABULARY.md
ARCH_TARGET.md   forensics/       workflow/
ARCHAEOLOGY.md   WORKFLOW_STATE.md
INTENT.md        TRIAGE.md
DELTA.md
```

**Lo que es correcto en esta vista:**

- Orchestrator TypeScript como coordinador determinista ✓
- Pi sessions como agentes especializados creados con el SDK ✓
- archbase/ como Single Source of Truth versionada con el código ✓
- Extensions mapeadas a hooks reales de Pi ✓

**Lo que esta vista revela como problema:** la UI del Director (ver Gap #1).

---

## 2. Inconsistencias Encontradas

### Inconsistencia A: El Orchestrator habla pero es TypeScript

**Dónde aparece:** en los flujos de extremo a extremo, el Orchestrator hace preguntas en lenguaje natural al
Director. *"El módulo de reporting tiene cobertura de tests insuficiente. ¿Procedo con ese plan?"* Esto implica
un agente LLM. Pero tras la corrección de Pi, el Orchestrator es TypeScript.


**La tensión real:** si el Orchestrator es TypeScript puro, solo puede presentar opciones estructuradas
(menús, checkpoints con tres botones). Eso es más rígido que lenguaje natural. Si queremos flexibilidad
conversacional, necesitamos una sesión Pi que sea la cara del Orchestrator hacia el Director.

**Resolución:** el Orchestrator tiene dos capas. La capa de coordinación es TypeScript puro (pipeline, health
map, postCycleUpdate). La capa de interacción con el Director es una sesión Pi especial, con un skill que le
da contexto sobre el estado del sistema y acceso a comandos del Orchestrator. El Director habla con Pi. Pi
traduce intención a comandos TypeScript del Orchestrator. Esto es exactamente cómo OpenClaw/ClawdBot
funciona sobre Pi: hay una sesión que es la interfaz y hay lógica de coordinación detrás.

**Implicación concreta:** hay un quinto skill de rol: `director-interface-role.skill`. Su función es hacer de
puente entre el lenguaje natural del Director y los comandos del Orchestrator. Este agente no hace trabajo
técnico — presenta estado, explica situaciones, y convierte decisiones del Director en llamadas a la API del
Orchestrator.

---

### Inconsistencia B: Los skills de contexto no pueden ser skills reales de Pi

**Dónde aparece:** en el catálogo de skills, los "skills de contexto" (`project-arch.skill`, `project-
constraints.skill`, `zone-context.skill`) se describieron como skills Pi con triggers.

**El problema:** los skills Pi usan triggers para detectar cuándo cargarlos (palabras clave en el prompt del
usuario). Los contenidos de `archbase/` son dinámicos y específicos del proyecto — no pueden ser ficheros
de skill estáticos con triggers genéricos. No puedes escribir un trigger que diga "carga el ARCH.md de este
proyecto" porque el contenido de ARCH.md cambia.

**Resolución ya documentada en el reality check:** los "skills de contexto" no son skills Pi — son strings
ensamblados por el Context Assembler TypeScript e inyectados vía `appendSystemPrompt` y el hook
`before_agent_start`. Los skills Pi reales son solo los de conocimiento (SOLID, patrones, clean code, legacy-
patterns) que son genéricos y estables. Esta distinción debe ser explícita en el catálogo de skills.

**Acción:** renombrar en el documento de skills: "Skills de Contexto" → "Contexto Dinámico (inyectado por el
Context Assembler)". No son skills en el sentido técnico de Pi.

---

### Inconsistencia C: AGENTS.md y el modo de arranque directo

**Dónde aparece:** en el reality check señalamos que Pi carga AGENTS.md automáticamente. Pero en el
diseño de archbase/ no definimos qué contiene ese fichero ni dónde vive.


**El problema:** si alguien abre Pi directamente en el directorio del proyecto (sin pasar por el Orchestrator),
Pi cargará AGENTS.md y tendrá contexto mínimo, pero no tendrá el contexto ensamblado por el Context
Assembler. El agente funcionará, pero sin las restricciones y el contexto de archbase/.

**Resolución:** `archbase/AGENTS.md` es un fichero generado y mantenido por el Orchestrator, no editado a
mano. Contiene: el resumen de ARCH.md, el contenido completo de CONSTRAINTS.md y CONVENTIONS.md,
y un aviso explícito: *"Este proyecto usa ArchAgent. Para operar con contexto completo, usa el Orchestrator.
Si estás usando Pi directamente, ten en cuenta que no tienes el contexto de Health Map ni DDRs activos."*
Este fichero es el fallback para uso directo, no el mecanismo principal.

## ---

### Inconsistencia D: La compactación de contexto y Pi nativo

**Dónde aparece:** diseñamos una `context-budget` extension que hace compactación inteligente.

**El problema:** Pi ya tiene compactación de contexto nativa (`4.11 - Context Management and Compaction`
en el DeepWiki). Construir la nuestra encima puede entrar en conflicto o duplicar trabajo.

**Resolución:** no construimos `context-budget` desde cero. En su lugar, configuramos la compactación
nativa de Pi con instrucciones específicas para nuestros agentes: *"en la compactación, preserva siempre el
contenido inyectado por appendSystemPrompt (que es el role y el contexto de archbase/) y comprime el
razonamiento intermedio"*. Esto se puede lograr con el hook `context` de las extensiones, que puede
modificar qué mensajes se preservan en la compactación. La `context-budget` extension se simplifica a:
monitorizar el uso de tokens y activar la compactación nativa cuando se acerca al límite, con las
instrucciones correctas.

## ---

### Inconsistencia E: Los nombres de roles no son consistentes entre documentos

**Dónde aparece:** el sistema base usó Scout/Design Agent/Implementation Agent/Review Agent. La
arquitectura unificada los renombró a Understand/Decide/Act/Verify. Los flujos y el catálogo de skills
mezclan ambas nomenclaturas.

**Resolución:** el nombre canónico es **Understand / Decide / Act / Verify**. En todo el sistema. Los
nombres anteriores son alias históricos del proceso de diseño. El glosario del proyecto debe dejarlo claro.

---


## 3. Gaps sin Resolver

### Gap #1 (Crítico): La interfaz del Director no está completamente diseñada

Es el gap más importante porque es lo primero que el Director experimenta. Sabemos que hay una sesión Pi
que hace de interfaz, pero no hemos diseñado:

- Qué comandos expone al Director (¿`/status`, `/approve`, `/reject`, `/task`?)
- Cómo presenta los checkpoints (¿como mensajes estructurados en el TUI de Pi?)
- Cómo el Director ve el estado del pipeline en curso
- Cómo el Director puede observar una sesión de agente en curso si quiere profundizar

**Por qué es crítico:** si la interfaz es torpe, el Director la abandona. Todo el diseño está pensado para
reducir la fricción del Director, pero si el punto de entrada es incómodo, no importa lo bien diseñado que esté
el resto.

**Propuesta de resolución:** el Director-Interface Agent es una sesión Pi interactiva (TUI) con un skill de rol
que le da acceso a comandos del Orchestrator vía bash. Los comandos del Orchestrator son un CLI simple
(`archagent status`, `archagent approve`, `archagent task "descripción"`). La sesión Pi usa el TUI completo de
Pi, incluyendo su capacidad de branching y observación de sesiones paralelas. La interfaz del Director ES Pi
— no hay que construir nada nuevo para la UI.

## ---

### Gap #2 (Importante): Recuperación de fallos

No hemos diseñado qué ocurre cuando una sesión Pi se interrumpe a mitad de un ciclo. Sabemos que
WORKFLOW_STATE.md persiste el estado, pero el procedimiento de recuperación no está definido.

**Los escenarios:**

- El Act Agent se interrumpe a mitad de la implementación → el código está en estado inconsistente
- El Orchestrator se cae durante un checkpoint → el Director no sabe si su aprobación se procesó
- El Verify Agent falla → postCycleUpdate no se ejecutó, el Health Map no se actualizó

**Propuesta de resolución:** WORKFLOW_STATE.md tiene un campo `last_completed_step`. Al arrancar, el
Orchestrator lee ese campo y ofrece al Director dos opciones: reanudar desde el último paso completado, o
descartar el ciclo en curso y empezar limpio. El Act Agent, antes de escribir cualquier fichero, registra en
WORKFLOW_STATE.md el fichero que va a modificar. Si se interrumpe, hay un log de qué ficheros pueden
estar en estado inconsistente.

---


### Gap #3 (Importante): Agentes en paralelo y conflictos de scope

Mencionamos que el Orchestrator puede lanzar múltiples Act Agents sobre módulos no solapados. Pero el
scope-enforcer de cada Act Agent no sabe qué ficheros están siendo modificados por sus agentes
hermanos.

**El riesgo:** dos Act Agents modificando el mismo fichero concurrentemente. En Pi, las herramientas `write`
y `edit` son operaciones de filesystem — no hay bloqueo nativo.

**Propuesta de resolución:** el Orchestrator mantiene un `lock-registry` en memoria (no en disco, para
simplicidad). Antes de crear un Act Agent, el Orchestrator calcula el conjunto de ficheros autorizados en su
DDR. Si alguno está en el lock-registry de otro agent activo, el Orchestrator no lanza el agente hasta que el
primero termine. La paralelización es real pero conservadora: solo módulos con sets de ficheros
completamente disjuntos pueden correr simultáneamente.

## ---

### Gap #4 (Moderado): Bootstrap del paquete de skills genéricos

Los skills de conocimiento (SOLID, clean-architecture, design-patterns, legacy-patterns, clean-code) son
genéricos y reutilizables entre proyectos. ¿Dónde viven? ¿Cómo se instalan? ¿Quién los mantiene?

**Propuesta de resolución:** son parte del paquete npm del sistema (`archagent`). Se instalan como ficheros
`.pi/skills/` en el directorio global `~/.pi/` durante la instalación del paquete. Pi los descubre
automáticamente desde ahí. Los triggers los activan on-demand. El usuario nunca tiene que gestionarlos —
son parte de la instalación.

## ---

### Gap #5 (Menor): Versionado de archbase/ y ramas de Git

No hemos diseñado cómo se comporta el sistema en un entorno de ramas Git. Los DDRs y el Health Map
están en `archbase/`, que está versionado. ¿Qué pasa cuando hay un merge conflict en `HEALTH_MAP.md`?

**Propuesta de resolución:** mantenerlo simple y explícito. `archbase/` tiene las mismas reglas que el
código: se versiona en la rama donde se trabaja. En los merges, los conflictos de `archbase/` se resuelven
como cualquier otro conflicto — con preferencia por la versión más reciente del Health Map y con los DDRs
de ambas ramas preservados. El Orchestrator, al detectar que está en una rama nueva sin Health Map
actualizado, propone al Director ejecutar un Understand rápido antes de trabajar.


## ---

## 4. Lo que Está Sólido y No Necesita Cambio

**La arquitectura de cuatro roles** es coherente de principio a fin. Understand/Decide/Act/Verify como roles
sobre sesiones Pi creadas por el SDK es el corazón del sistema y está bien diseñado.

**El Health Map y el Pipeline Configurator** tienen una lógica clara y determinista. El mapeo dimensión →
comportamiento del pipeline es consistente en todos los documentos. Implementable como una función
TypeScript de ~100 líneas.

**archbase/ y su modelo de propiedad** están muy bien diseñados. El principio de un solo escritor por
artefacto, los invariantes explícitos, y el ciclo de vida de cada fichero son coherentes internamente y con las
capacidades de Pi.

**Las extensiones plan-guard y scope-enforcer** mapean limpiamente al hook `tool_call` de Pi. Son las
piezas más directamente implementables del sistema. Cada una es ~30-50 líneas de TypeScript.

**El mecanismo de checkpoints como Promises** es elegante y correcto. El Orchestrator TypeScript hace
`await checkpoint(artefacto)` y el pipeline se pausa. La UI presenta el artefacto al Director. La Promise se
resuelve con la decisión. Sin magia.

**postCycleUpdate** es determinista, testeable, y concretamente implementable. Leer el Audit Report,
parsear findings, actualizar ficheros de archbase/. No hay ambigüedad.

**La extracción de CONSTRAINTS desde feedback del Director** es uno de los mecanismos más valiosos del
sistema y es completamente implementable: tras un rechazo con comentario, el Director-Interface Agent (la
sesión Pi del Director) propone añadir la restricción y llama a un comando del Orchestrator si el Director
acepta.

---

## 5. Árbol de Dependencias de Implementación

Qué hay que construir antes de qué. Esto es fundamental para la hoja de ruta real.

```
NIVEL 0 — Prerequisitos (no construimos, ya existen)
· Pi SDK (@mariozechner/pi-coding-agent)
· Pi extension API (hooks: tool_call, before_agent_start, context, agent_end)


NIVEL 1 — Infraestructura base (sin esto nada funciona)
· archbase/ scaffolding (estructura de directorios + ficheros vacíos de bootstrap)
· plan-guard extension (interceptor tool_call para Understand y Decide)
· scope-enforcer extension (interceptor tool_call para Act)
· Context Assembler (función TypeScript: rol + zona → appendSystemPrompt string)

NIVEL 2 — Ciclo mínimo viable (el loop más simple que tiene valor)
· Understand Agent (Pi session + plan-guard + understand-role.skill)
· Decide Agent (Pi session + plan-guard + decide-role.skill)
· Act Agent (Pi session + scope-enforcer + act-role.skill)
· Verify Agent (Pi session + health-tracker + verify-role.skill)
· Orchestrator básico: lanza los cuatro en secuencia, un checkpoint entre Decide y Act

NIVEL 3 — Health Map y detección
· HEALTH_MAP.md reader/writer en TypeScript
· Pipeline Configurator (función: zona → pipeline config)
· postCycleUpdate (función: auditReport → archbase/ updates)
· health-tracker extension (actualiza HEALTH_MAP al final de Verify)

NIVEL 4 — Interfaz del Director
· Director-Interface Agent (sesión Pi interactiva + director-interface-role.skill)
· archagent CLI (comandos: status, approve, reject, task)
· Checkpoint UI (presentación de artefactos en el TUI de Pi)

NIVEL 5 — Modo legacy
· understand-deep-role.skill + legacy-patterns.skill
· Characterization Act (sub-tipo de Act con scope limitado a tests)
· ARCHAEOLOGY.md / INTENT.md / DELTA.md writers
· decide-incremental-role.skill

NIVEL 6 — Madurez y evolución
· Git delta detector (stale zone detection)
· DEBT.md lifecycle (cierre automático de entradas)
· DDR archive/expiration logic
· Periodic review generation
· Feedback → CONSTRAINTS extractor

NIVEL 7 — Paralelismo y recuperación
· Lock registry para Act Agents concurrentes
· Recovery procedure desde WORKFLOW_STATE.md
```


Los niveles 1-4 son el MVP. El sistema tiene valor real desde el Nivel 2 (ciclo mínimo viable), aunque sea
torpe en la interfaz. Cada nivel añade capacidad sin romper lo anterior.

---

## 6. Veredicto de Implementabilidad

**¿Es implementable con Pi tal como existe hoy?** Sí, con matices.

**Lo implementable sin ambigüedad:**

- Los cuatro agentes especializados como sesiones Pi con skills y extensions
- plan-guard y scope-enforcer como interceptores tool_call
- El Orchestrator TypeScript usando el SDK de Pi
- archbase/ como conjunto de ficheros Markdown versionados
- Los checkpoints como Promises
- postCycleUpdate como lógica TypeScript determinista
- Los skills de conocimiento genéricos como ficheros .skill.md con triggers

**Lo implementable con trabajo de diseño adicional:**

- La interfaz del Director (Gap #1) — necesita diseño de UX antes de implementar
- La recuperación de fallos (Gap #2) — necesita diseño del protocolo de recovery
- El Director-Interface Agent — necesita definir el vocabulario de comandos del Orchestrator CLI

**Lo que requiere validación empírica:**

- La calidad del output del Understand Agent con el skill de rol correcto — hay que probarlo con repos reales
para calibrar
- La precisión del Decide Agent en modo incremental sobre legacy — requiere iteración
- La utilidad del Audit Report del Verify Agent — el skill de verify-role necesita ajuste fino basado en uso real

**Lo que no necesita resolverse antes de empezar:**

- El modo legacy completo (Nivel 5) — no bloquea el MVP
- Paralelismo (Nivel 7) — no bloquea nada hasta que haya necesidad real
- La revisión periódica y la purga de archbase/ — emerge del uso, no hay que construirlo desde el primer día

---

## 7. Dos Decisiones Arquitectónicas Pendientes

Hay dos decisiones que no hemos tomado explícitamente y que hay que tomar antes de implementar.


### Decisión A: ¿El Director-Interface Agent es una sesión Pi persistente o se crea por tarea?

**Opción 1:** sesión persistente, siempre activa, el Director la tiene abierta como si fuera un chat. Más
natural. Requiere que el Orchestrator pueda recibir mensajes del Director-Interface Agent en cualquier
momento.

**Opción 2:** se crea por tarea. El Director lanza `archagent task "descripción"`, eso abre una sesión Pi para
esa tarea, y cuando la tarea termina la sesión se cierra. Más simple. Menos fluida.

**Recomendación:** Opción 2 para el MVP, Opción 1 como evolución. La Opción 2 es más implementable y el
Director puede tener múltiples tareas abiertas en terminales paralelas si necesita paralelismo.

### Decisión B: ¿Las sesiones de los agentes son in-memory o persisten a disco?

**Opción 1:** in-memory. Cada ciclo crea sesiones Pi frescas. El estado entre ciclos vive en `archbase/`
exclusivamente. Simple, sin estado residual problemático.

**Opción 2:** persisten a disco. El Orchestrator puede reanudar la sesión del Act Agent si se interrumpe. Más
complejo pero permite recovery real.

**Recomendación:** Opción 1 para el MVP. `archbase/` es la única fuente de persistencia. Si una sesión se
interrumpe, el Orchestrator lee WORKFLOW_STATE.md y crea sesiones frescas con el mismo contexto desde
el punto donde estaba. Las sesiones Pi no son el estado del sistema — archbase/ lo es.

---

## 8. Resumen Ejecutivo

El diseño es coherente, su filosofía es consistente de principio a fin, y sus piezas críticas son implementables
con Pi hoy.

Hay cinco inconsistencias a corregir, ninguna destructiva. Las más importantes son la naturaleza del
Orchestrator-Director (resuelta con el Director-Interface Agent como sesión Pi sobre un CLI TypeScript) y la
distinción entre skills reales de Pi y contexto dinámico inyectado por el Context Assembler.

Hay cinco gaps, uno crítico (la UX del Director), dos importantes (recovery, paralelismo), y dos menores. El
gap crítico tiene propuesta de resolución concreta.

El sistema tiene un árbol de dependencias de implementación claro en siete niveles. Los niveles 1-4 son el
MVP con valor real. Los niveles 5-7 son evolución que no bloquea empezar.


El mayor riesgo de implementación no es técnico — es la calibración de los skills de rol. Los agentes son tan
buenos como sus instrucciones. Los primeros sprints de implementación deben incluir ciclos cortos de test
con repos reales para ajustar los skills antes de construir más infraestructura encima.


