# archbase/ — Diseño Completo
### Estructura · Modelo de Propiedad · Ciclo de Vida

---

## Principios de Diseño del Propio archbase/

Antes de definir los ficheros, los principios que gobiernan el diseño del conjunto:

**Un solo escritor por artefacto.** Cada fichero tiene exactamente un agente o el Director como responsable
de su contenido. Otros pueden leerlo, pueden proponer cambios a través del flujo normal, pero no pueden
escribirlo directamente. Esto elimina la ambigüedad sobre quién tiene razón cuando hay conflicto.

**Propiedad ≠ autoría exclusiva.** Que el Understand Agent sea el escritor de `HEALTH_MAP.md` no significa
que el Director no pueda ajustarlo. Significa que el Director tiene un mecanismo explícito para hacerlo (una
sección de overrides), no que simplemente edite el fichero a mano de forma invisible para el sistema.

**Los artefactos tienen estado, no solo contenido.** Todo artefacto tiene metadatos de ciclo de vida: cuándo
fue creado, por qué agente, cuándo fue validado por el Director, cuándo pierde vigencia, si está activo o
archivado. Sin estado explícito, el sistema no puede razonar sobre la frescura de su propio conocimiento.

**La consistencia es eventual, pero las dependencias son explícitas.** El sistema no garantiza que todos los
artefactos estén sincronizados en todo momento — eso sería imposible en un sistema concurrente. Lo que
garantiza es que cada artefacto declara de qué otros depende, y el Orchestrator sabe cuándo una
dependencia ha cambiado y marca los artefactos dependientes como "pendientes de revisión".

**El bootstrap es un contrato.** Para que el sistema pueda arrancar en un repo nuevo, hay un conjunto
mínimo de artefactos que deben existir. Ese conjunto mínimo está definido. Todo lo demás es opcional y
emerge del trabajo.

---

## Estructura de directorios

```
archbase/
│
├── knowledge/          # Lo que el sistema sabe sobre el repo
│ ├── ARCH.md
│ ├── ARCH_TARGET.md  # Solo existe si hay zona legacy activa


│ ├── PATTERNS.md
│ ├── CONVENTIONS.md
│ ├── CONSTRAINTS.md
│ └── VOCABULARY.md
│
├── health/             # El estado de salud del repo
│ ├── HEALTH_MAP.md
│ ├── DEBT.md
│ ├── METRICS.md
│ └── zones/          # Un fichero por zona cuando se necesita detalle
│ ├── auth.md
│ ├── billing.md
│ └── ...
│
├── forensics/          # Solo existe en zonas con legacy activo
│ ├── ARCHAEOLOGY.md
│ ├── INTENT.md
│ └── DELTA.md
│
├── decisions/          # El registro de todas las decisiones de diseño
│ ├── DDR-001.md
│ ├── DDR-002.md
│ ├── _index.md       # Índice con estado de cada DDR
│ └── _archive/       # DDRs obsoletos pero preservados
│
└── workflow/           # El estado del trabajo en curso
├── WORKFLOW_STATE.md
└── TRIAGE.md
```

---

## Área 1: knowledge/

Esta área es la memoria de largo plazo del sistema. Cambia despacio. El Director Humano es el guardián
principal: ningún agente puede modificar estos ficheros sin que el cambio sea validado por el Director en un
checkpoint explícito. Lo que los agentes pueden hacer es **proponer actualizaciones** a través de sus
artefactos de output — el Director decide si las acepta.

---


### `knowledge/ARCH.md`
**Propietario:** Understand Agent (propone) · Director (valida)
**Lectores:** todos los agentes en todos los modos

El mapa arquitectónico del sistema tal como existe realmente. No como debería ser — como es. Incluye las
capas identificadas, los contratos entre módulos (qué expone cada uno, qué consume), la dirección de las
dependencias, y los puntos de extensión conocidos.

**Ciclo de vida:**

- Nace en el primer ciclo Understand del repo
- Se actualiza cuando el Understand Agent descubre algo que lo invalida (nueva capa implícita, dependencia
no documentada, patrón que se usa diferente de lo que ARCH.md dice)
- El Understand Agent no edita ARCH.md directamente — propone un diff en su output, y el Director lo acepta
o lo corrige en el checkpoint
- Nunca se elimina, pero puede tener secciones marcadas como "pendiente de revisión" cuando el Health
Map indica cambios significativos en zonas relacionadas

**Invariante crítico:** ARCH.md describe la arquitectura actual, no la deseada. Si hay delta entre ambas, ese
delta vive en `forensics/DELTA.md`. Mezclar ambas en ARCH.md destruye la utilidad de ambas.

---

### `knowledge/ARCH_TARGET.md`
**Propietario:** Decide Agent (propone) · Director (define y valida)
**Lectores:** Decide Agent, Verify Agent, Orchestrator

La arquitectura objetivo: cómo debería ser el sistema cuando el trabajo de transformación esté completo.
Solo existe cuando hay zonas en modo legacy con transformación activa.

**Ciclo de vida:**

- Nace cuando el Director inicia un proceso de transformación de una zona legacy y aprueba la arquitectura
objetivo propuesta por el Decide Agent (flujo L1)
- Se actualiza solo cuando el Director lo decide explícitamente — no como efecto secundario del trabajo de
los agentes
- Muere (se archiva en `decisions/_archive/`) cuando el DELTA.md correspondiente alcanza convergencia
total y el Director certifica la transformación completa

**Tensión de diseño resuelta:** ARCH_TARGET.md podría ser simplemente una sección de ARCH.md
marcada como "objetivo". Se descarta porque mezcla el estado actual con el estado deseado en el mismo
documento, y esa mezcla confunde a los agentes que necesitan razonar sobre la brecha entre ambos.


## ---

### `knowledge/PATTERNS.md`
**Propietario:** Understand Agent (descubre y propone) · Director (valida)
**Lectores:** Decide Agent, Verify Agent

El catálogo de patrones de diseño *tal como están implementados en este repo concreto*. No es una
referencia de patrones en abstracto — es un inventario de dónde y cómo se usa cada patrón en el codebase,
con las variantes específicas que el equipo ha adoptado.

La distinción es importante: el sistema tiene un skill genérico de patrones GoF. `PATTERNS.md` es el overlay
de ese conocimiento genérico con la realidad de este repo. Si el equipo usa Repository pero lo llama Store, si
usa Command pero con una variante asíncrona no canónica, si usa Strategy pero implementado como
función en lugar de clase — todo eso está aquí.

**Ciclo de vida:**

- Nace progresivamente: el primer Understand no lo completa todo, solo documenta lo que encuentra
- Crece con cada ciclo Understand sobre nuevas zonas
- Se actualiza cuando el Verify Agent detecta que un patrón se está usando de forma inconsistente con lo
documentado (advisory issue que puede disparar actualización de PATTERNS.md o corrección del código)
- Nunca se elimina, pero los patrones pueden marcarse como "deprecated en este repo" si el equipo decide
migrar a otro

## ---

### `knowledge/CONVENTIONS.md`
**Propietario:** Director (escribe directamente)
**Lectores:** Act Agent, Verify Agent

Las convenciones del equipo: naming, estructura de ficheros, estilo de tests, organización de módulos,
formato de errores, gestión de configuración. No son principios de diseño — son las reglas específicas de
este equipo para este proyecto.

Este es uno de los dos ficheros que el Director escribe directamente sin mediación de agentes, porque las
convenciones son una decisión del equipo, no una observación del código.

**Ciclo de vida:**

- Nace en el bootstrap, inicialmente mínimo (el Director escribe lo que sabe)
- Crece cuando el Verify Agent observa una convención implícita no documentada y la propone para inclusión
- Se actualiza cuando el equipo cambia una convención (el Director lo edita directamente)


- Los cambios de convención tienen fecha explícita, porque el código anterior a la fecha puede seguir la
convención vieja y eso es correcto para ese código

---

### `knowledge/CONSTRAINTS.md`
**Propietario:** Director (escribe directamente)
**Lectores:** todos los agentes, el Context Assembler lo carga siempre

Las restricciones explícitas del proyecto: cosas que nunca se deben hacer, dependencias que nunca se
deben introducir, patrones que están prohibidos en ciertos contextos, decisiones de negocio o legales que se
expresan como restricciones técnicas.

Este es el principal mecanismo de control del Director sobre el comportamiento de todos los agentes. Una
línea en CONSTRAINTS.md equivale a una restricción global que ningún agente puede ignorar.

**Ciclo de vida:**

- Nace en el bootstrap (inicialmente puede estar vacío, pero el fichero debe existir)
- Crece cuando el Director añade restricciones — proactivamente o como respuesta a un problema que el
Verify Agent o el Director mismo descubrieron
- Las restricciones tienen fecha y razón, porque una restricción sin contexto que explique por qué existe
tiende a desaparecer cuando quien la puso ya no está
- Las restricciones nunca se eliminan sin reflexión explícita: cuando una restricción ya no aplica, se mueve a
una sección "restricciones históricas" con la razón de por qué dejó de aplicar. Eso es conocimiento
institucional.

---

### `knowledge/VOCABULARY.md`
**Propietario:** Director (valida) · Understand Agent (descubre y propone)
**Lectores:** Decide Agent principalmente; todos en el momento de nombrar conceptos

El vocabulario del dominio: los términos que el negocio usa y cómo se mapean a los conceptos del código. El
lenguaje ubicuo del sistema, hecho explícito.

Es el fichero más infravalorado del sistema y el que más impacto tiene a largo plazo. Cuando el vocabulario
del dominio está documentado, el Decide Agent puede proponer nombres de clases, métodos y módulos que
reflejan el lenguaje del negocio. Sin él, el código acumula términos técnicos que solo los ingenieros
entienden, y la brecha entre el código y el negocio crece con cada sprint.

**Ciclo de vida:**


- Nace en el bootstrap, mínimo, con los términos más evidentes
- Crece cuando el Understand Agent encuentra un término del dominio en el código no documentado, o
cuando el Director añade terminología del negocio
- Se actualiza cuando el negocio cambia su propio vocabulario (raro pero importante)
- Los conflictos de vocabulario (mismo término con significados distintos en distintas partes del sistema) se
marcan explícitamente como "ambigüedad documentada" y son candidatos prioritarios para una decisión de
diseño

---

## Área 2: health/

Esta área refleja el estado real del repo en el tiempo. Cambia con cada ciclo de trabajo. Es la memoria de
corto-medio plazo del sistema.

---

### `health/HEALTH_MAP.md`
**Propietario:** Understand Agent (actualiza tras cada análisis) · Director (puede añadir overrides)
**Lectores:** Orchestrator, Context Assembler, Pipeline Configurator — siempre lo primero que se lee

El artefacto más consultado del sistema. Para cada zona del repo, contiene el perfil de salud en las cuatro
dimensiones (legibilidad estructural, confiabilidad de tests, predictibilidad del impacto, alineación
arquitectónica), con nivel de confianza (análisis rápido o profundo), timestamp del último análisis, y cualquier
override manual del Director.

**Estructura conceptual de cada entrada de zona:**

- Identidad de la zona (módulo, directorio, conjunto de ficheros)
- Perfil de salud por dimensión: estado (sano / atención / comprometido) + nivel de confianza
- Última vez analizada y por qué tipo de análisis
- Overrides del Director: si ha ajustado alguna dimensión, con razón y fecha
- Historial simplificado: tendencia de las últimas N actualizaciones (mejorando / estable / degradando)

**Ciclo de vida:**

- Nace con el primer análisis de cualquier zona
- Se actualiza tras cada ciclo completo (Understand → Decide → Act → Verify): el Verify Agent, al final del
ciclo, actualiza el perfil de la zona con lo que ha aprendido
- Los overrides del Director tienen prioridad sobre el análisis automático hasta que el Director los retire o
hasta que un análisis profundo los confirme o contradiga (en ese caso, el sistema notifica al Director la
discrepancia)


- Las zonas que no han sido analizadas en N días tienen su perfil marcado como "stale" y el Orchestrator lo
considera al configurar el pipeline

**El invariante más importante de todo el sistema:** HEALTH_MAP.md nunca refleja lo que los agentes
*desean* que sea el estado — solo lo que observaron. Un agente que acaba de mejorar un módulo no puede
marcarlo como "sano" en el Health Map. Solo el Verify Agent puede actualizar el perfil, y solo tras verificar
objetivamente.

---

### `health/DEBT.md`
**Propietario:** Verify Agent (registra deuda) · Director (prioriza y cierra)
**Lectores:** Orchestrator (para el Triage), Decide Agent (como contexto)

El registro de deuda técnica conocida. Cada entrada tiene: localización, tipo (estructural / hygiene /
cosmética), impacto estimado, riesgo de intervención, quién la descubrió y cuándo, si el Director la ha
priorizado, y si está vinculada a un DDR activo que la está resolviendo.

**La distinción más importante:** DEBT.md no es un backlog de tareas. Es un registro de conocimiento. La
decisión de convertir una deuda en una tarea es del Director, no del sistema. El sistema se limita a mantener
el registro honesto.

**Ciclo de vida:**

- El Verify Agent añade entradas como resultado de sus auditorías (advisory issues)
- El Director revisa periódicamente y prioriza o descarta entradas
- Una entrada se cierra cuando un Verify Agent confirma que el DDR que la abordaba fue implementado
correctamente y la deuda ya no existe
- Las entradas cerradas se archivan (no se eliminan): saber qué deuda existió y cuándo se resolvió es
también conocimiento institucional

---

### `health/METRICS.md`
**Propietario:** Verify Agent (actualiza) · Director (interpreta)
**Lectores:** Director principalmente; Orchestrator para decisiones de pipeline

Las métricas de evolución del sistema a lo largo del tiempo. No métricas de código en el sentido de
complejidad ciclomática por función — métricas de sistema en el sentido de tendencias que el Director
necesita para tomar decisiones estratégicas.


Las métricas relevantes son las que ya definimos: architecture alignment score, seam coverage,
characterization coverage, DELTA progress, debt velocity. Aquí se añaden sus series temporales para hacer
visible si la tendencia es positiva o negativa.

**Ciclo de vida:**

- Nace cuando hay suficientes ciclos de trabajo para que las métricas sean significativas (no en el bootstrap)
- Se actualiza al final de cada ciclo completo
- Nunca se elimina — la serie histórica completa es el valor

---

### `health/zones/`
**Propietario:** Understand Agent (crea y actualiza)
**Lectores:** Decide Agent, Verify Agent, Context Assembler

Directorio con un fichero por zona cuando el análisis de esa zona es suficientemente rico como para no
caber en la entrada del HEALTH_MAP.md. El HEALTH_MAP.md es el índice; los ficheros de zones/ son el
detalle.

En zonas sanas, estos ficheros pueden no existir. En zonas con análisis profundo, contienen el detalle del
análisis: qué ficheros componen la zona, qué dependencias internas hay, cuáles son los load-bearing walls
identificados, qué seams están disponibles.

## ---

## Área 3: forensics/

Esta área solo existe cuando hay zonas en modo legacy con transformación activa. Si no hay legacy, el
directorio no existe. Cuando el legacy de una zona se resuelve completamente, sus ficheros se archivan, no
se eliminan.

---

### `forensics/ARCHAEOLOGY.md`
**Propietario:** Understand Agent (modo profundo)
**Lectores:** Decide Agent (modo incremental), Context Assembler

El mapa forense del repo: lo que el código es realmente, con sus dialectos, sus anti-patrones dominantes, sus
load-bearing walls, y sus reglas de negocio fugitivas. Ya lo diseñamos en detalle en el documento de
extensión legacy.


**La propiedad más importante:** ARCHAEOLOGY.md no juzga. Describe. No dice "este código está mal" —
dice "este código hace esto, de esta forma, en estos ficheros". El juicio sobre qué cambiar y cómo es
responsabilidad del Decide Agent y del Director.

---

### `forensics/INTENT.md`
**Propietario:** Understand Agent (propone) · Director (valida y corrige — obligatorio)
**Lectores:** Decide Agent (siempre en modo incremental)

La intención original inferida del sistema. El único fichero de forensics/ que requiere validación obligatoria
del Director antes de que cualquier otro agente lo use. La razón es que el Understand Agent infiere la
intención a partir del código, y puede equivocarse. El Director tiene contexto histórico y conocimiento del
negocio que el análisis estático no puede capturar.

**Una regla no negociable:** ningún Decide Agent puede cargar INTENT.md como contexto hasta que el
Director haya validado explícitamente esa versión. Un INTENT.md no validado es peor que ningún INTENT.md,
porque confunde al Decide Agent con suposiciones incorrectas.

---

### `forensics/DELTA.md`
**Propietario:** Decide Agent (calcula el gap) · Director (valida y ajusta)
**Lectores:** Verify Agent (direction check), Orchestrator (para configurar el pipeline), Decide Agent (modo
incremental)

El mapa de transformación: la distancia entre lo que ARCHAEOLOGY.md describe y lo que ARCH_TARGET.md
define. No es una lista de tareas — es un análisis estructurado del gap, organizado por dimensión
arquitectónica, con estimación de la complejidad de cada tramo.

**Ciclo de vida con invariante importante:** DELTA.md no se actualiza con cada pequeña mejora. Se
actualiza cuando el Verify Agent confirma que una sección entera del delta ha sido cerrada. Actualizar el
DELTA.md continuamente crea ruido y oscurece el progreso real. La granularidad correcta es "sección del
delta" (por ejemplo, "capa de dominio desacoplada de infraestructura"), no "fichero mejorado".

---

## Área 4: decisions/

Esta área es el registro histórico de todas las decisiones de diseño. Es el alma del sistema: sin ella, el
conocimiento que generó cada decisión se pierde, y el equipo está condenado a repetir los mismos debates.


## ---

### `decisions/DDR-NNN.md`
**Propietario:** Decide Agent (crea el borrador) · Director (aprueba o rechaza)
**Lectores:** Act Agent (su restricción principal), Verify Agent, futuros Decide Agents (como contexto
histórico)

El Design Decision Record. Ya diseñamos su contenido en el sistema base. En el sistema unificado, el DDR
tiene secciones adaptativas:

**Secciones siempre presentes:**

- Contexto: qué dice ARCH.md y el Health Map sobre la zona afectada
- Decisión: qué se ha decidido y por qué
- Alternativas consideradas: qué opciones se evaluaron y por qué se descartaron
- Restricciones respetadas: qué entradas de CONSTRAINTS.md aplican
- Impacto en ARCH.md: si esta decisión requiere actualizar el mapa arquitectónico

**Secciones presentes solo en modo legacy (zona con dimensiones comprometidas):**

- Baby Step constraint: por qué esta decisión es el paso más pequeño posible en la dirección correcta
- Qué no cambia: lista explícita de comportamientos que deben seguir siendo exactamente iguales
- Seams utilizados: qué puntos de extensión existentes hace uso esta decisión
- Deuda contraída conscientemente: si el cambio introduce deuda para ser pragmático, se registra aquí con
razón y plan de resolución

**Ciclo de vida:**

- Nace como borrador cuando el Decide Agent lo produce
- Espera la aprobación del Director (checkpoint obligatorio)
- Pasa a estado "activo" cuando el Director lo aprueba — en ese momento es la ley para el Act Agent
- Pasa a estado "implementado" cuando el Verify Agent confirma la correcta implementación
- Se archiva en `decisions/_archive/` cuando ya no es relevante como guía de trabajo activa, pero se preserva
para consulta histórica
- Nunca se elimina: un DDR cancelado o rechazado también es conocimiento valioso

---

### `decisions/_index.md`
**Propietario:** Orchestrator (mantiene automáticamente)
**Lectores:** Director, todos los agentes que buscan decisiones relevantes


El índice de todos los DDRs con su estado, fecha, zona afectada, y una línea de resumen. Es el punto de
entrada para que un Decide Agent pueda buscar decisiones pasadas relevantes antes de proponer una
nueva.

**El invariante más importante del área decisions/:** el _index.md debe estar siempre sincronizado con los
DDRs que existen. Es el único fichero que el Orchestrator puede actualizar sin aprobación del Director — es
pura gestión administrativa.

---

## Área 5: workflow/

Esta área es la memoria de corto plazo del sistema: el estado del trabajo en curso. Cambia con cada
interacción.

---

### `workflow/WORKFLOW_STATE.md`
**Propietario:** Orchestrator
**Lectores:** Director, todos los agentes activos

El tablero del sistema: qué agente está activo, en qué zona, con qué objetivo, qué checkpoints están
pendientes de aprobación del Director, qué está bloqueado y por qué.

**Ciclo de vida:** vive mientras hay trabajo activo. Se resetea al inicio de cada nueva tarea de alto nivel. El
histórico de estados no se preserva aquí — eso es responsabilidad de la propia sesión Pi de cada agente.

## ---

### `workflow/TRIAGE.md`
**Propietario:** Understand Agent (propone entradas) · Director (prioriza)
**Lectores:** Orchestrator, Director

La lista priorizada de trabajo identificado pero aún no convertido en tareas activas. Aquí aterrizan los findings
del Verify Agent que no son blocking issues, las entradas de DEBT.md que el Director ha decidido atacar, y los
gaps del DELTA.md que el Director ha priorizado.

**La distinción con DEBT.md:** DEBT.md es un registro objetivo de deuda. TRIAGE.md es una lista de trabajo
activo priorizado. Una entrada puede vivir en DEBT.md indefinidamente si el Director no la prioriza. Solo entra
en TRIAGE.md cuando hay una decisión de atacarla.


## ---

## El Modelo de Propiedad Resumido

| Fichero | Escribe | Valida/Aprueba | Lectores clave |
|---|---|---|---|
| ARCH.md | Understand (propone) | Director | Todos |
| ARCH_TARGET.md | Decide (propone) | Director | Decide, Verify, Orchestrator |
| PATTERNS.md | Understand (propone) | Director | Decide, Verify |
| CONVENTIONS.md | Director (directo) | — | Act, Verify |
| CONSTRAINTS.md | Director (directo) | — | Todos (siempre) |
| VOCABULARY.md | Understand (propone) | Director | Decide |
| HEALTH_MAP.md | Understand + Verify | Director (overrides) | Orchestrator, Context Assembler |
| DEBT.md | Verify | Director (prioriza) | Orchestrator |
| METRICS.md | Verify | — | Director |
| zones/* | Understand | — | Decide, Verify |
| ARCHAEOLOGY.md | Understand profundo | — | Decide, Context Assembler |
| INTENT.md | Understand (propone) | Director (obligatorio) | Decide |
| DELTA.md | Decide (calcula) | Director | Verify, Orchestrator |
| DDR-NNN.md | Decide (borrador) | Director (aprueba) | Act, Verify |
| _index.md | Orchestrator | — | Todos |
| WORKFLOW_STATE.md | Orchestrator | — | Director, agentes activos |
| TRIAGE.md | Understand (propone) | Director (prioriza) | Orchestrator |

---

## El Bootstrap: el mínimo viable para arrancar

Para que el sistema pueda operar en un repo nuevo, estos son los ficheros que deben existir antes de la
primera operación:

**Obligatorios (el sistema no arranca sin ellos):**

- `knowledge/CONSTRAINTS.md` — puede estar vacío, pero debe existir para que el Context Assembler
pueda cargarlo
- `knowledge/CONVENTIONS.md` — idem
- `workflow/WORKFLOW_STATE.md` — el Orchestrator lo crea en el primer arranque

**Generados en el primer ciclo Understand:**

- `health/HEALTH_MAP.md` — primer análisis rápido de todas las zonas visibles
- `knowledge/ARCH.md` — primera versión del mapa arquitectónico (borrador pendiente de validación del
Director)


**El resto emerge del trabajo.** No se crean preventivamente. Un `PATTERNS.md` vacío es ruido. Un
`DEBT.md` sin entradas reales es teatro. Los artefactos nacen cuando hay algo real que documentar en ellos.

---

## Los Invariantes del Sistema Completo

Estos son los invariantes que ningún agente puede violar y que el Orchestrator debe poder verificar en
cualquier momento:

1. **Ningún Act Agent opera en una zona cuyo Health Map esté marcado como stale.** El Orchestrator debe
forzar un Understand actualizado primero.
2. **Ningún Act Agent opera sin un DDR aprobado por el Director.** Sin excepción, sin override. Si urge, el
DDR puede ser micro y rápido, pero debe existir y estar aprobado.
3. **Ningún Decide Agent usa INTENT.md no validado.** Un INTENT.md sin firma del Director es invisible para
el Decide Agent.
4. **HEALTH_MAP.md solo lo actualiza el Verify Agent** (o el Director con override explícito). Ningún otro
agente puede cambiar el perfil de salud de una zona.
5. **CONSTRAINTS.md y CONVENTIONS.md solo los edita el Director.** Los agentes pueden proponer
adiciones a través de sus outputs, pero no pueden modificar estos ficheros.
6. **Los DDRs aprobados son inmutables.** Si el Director necesita cambiar una decisión, se crea un nuevo
DDR que supercede al anterior, con referencia explícita. El DDR original queda archivado tal como fue
aprobado.
7. **archbase/ es versionado junto con el código.** No es documentación externa — es parte del repositorio.
La historia de archbase/ es la historia del pensamiento arquitectónico del equipo.


