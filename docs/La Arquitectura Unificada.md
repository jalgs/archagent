# La Arquitectura Unificada
### Un solo sistema que opera en cualquier terreno

---

## El Principio Unificador

Los dos sistemas que diseñamos hasta ahora parecen distintos porque se describieron en contextos
distintos. Pero si miramos qué hace realmente cada agente, hay un patrón que se repite:

- Alguien **entiende** el terreno antes de actuar
- Alguien **decide** qué hacer y lo documenta
- Alguien **ejecuta** lo decidido dentro de unos límites
- Alguien **verifica** que lo ejecutado es correcto y seguro

Eso es verdad en el sistema base y en el sistema legacy. Lo que cambia no es la estructura — es la
**profundidad y el tipo de trabajo** que cada rol realiza dependiendo del terreno.

**El principio de diseño unificador:** el sistema tiene siempre los mismos roles, los mismos flujos, y los
mismos puntos de control. Lo que varía es la *configuración* de cada rol, determinada por el Health Map de
la zona sobre la que opera. No hay dos sistemas — hay un sistema con comportamiento parametrizado.

Esto es, en esencia, el patrón **Strategy** aplicado a nivel de sistema completo. El Health Map es el contexto
que selecciona la estrategia de operación para cada agente.

---

## La Estructura en Tres Capas

El sistema unificado se organiza en tres capas con responsabilidades bien separadas:

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE DIRECCIÓN                     │
│                   (Director Humano)                      │
│     Intención · Restricciones · Aprobaciones · Ajustes  │
└──────────────────────────┬──────────────────────────────┘
│
┌──────────────────────────▼──────────────────────────────┐
│                  CAPA DE ORQUESTACIÓN                    │


## │ │

│   Health Map ──► Orchestrator ──► Context Assembler      │
│ │ │
│              Pipeline Configurator                       │
└──────────┬────────────┬────────────┬────────────┬────────┘
│ │ │ │
┌──────────▼──┐ ┌──────▼──┐ ┌─────▼──┐ ┌─────▼──────┐
│  CAPA DE    │ │ │ │ │ │ │
│  EJECUCIÓN  │ │ │ │ │ │ │
│ │ │ │ │ │ │ │
│  Understand │ │ Decide  │ │  Act   │ │  Verify    │
│  Agent      │ │ Agent   │ │ Agent  │ │  Agent     │
└─────────────┘ └─────────┘ └────────┘ └────────────┘
```

### Capa de Dirección
El Director Humano no interactúa con los agentes directamente. Interactúa con el sistema a través de dos
interfaces:

- **`archbase/`**: donde expresa restricciones, valida artefactos, ajusta el Health Map, y aprueba decisiones
- **El Orchestrator**: donde expresa intenciones de alto nivel ("añade esta feature", "refactoriza este módulo",
"revisa este PR")

El Director nunca necesita saber qué agente está activo ni en qué modo opera. Eso es responsabilidad de la
capa de orquestación.

### Capa de Orquestación
Aquí vive la inteligencia del sistema. Esta capa tiene tres componentes:

**Health Map:** el artefacto vivo que describe el estado de cada zona. No toma decisiones — es una fuente
de verdad consultada por los otros dos componentes.

**Context Assembler:** dado un objetivo y una zona, ensambla el contexto completo que necesita cada
agente. Carga los ficheros correctos de `archbase/`, selecciona los skills apropiados, activa las extensions
necesarias, y configura los límites operativos. Es el componente que hace que el mismo agente se comporte
diferente en una zona sana que en una zona legacy — no porque el agente cambie, sino porque su contexto
cambia.

**Pipeline Configurator:** dado el perfil de salud de la zona, determina qué pasos del pipeline son
obligatorios, cuáles son opcionales, y dónde van los checkpoints humanos. En una zona sana, el pipeline


puede ser lineal y con pocos checkpoints. En una zona con múltiples dimensiones comprometidas, el
pipeline añade pasos previos, más checkpoints, y restricciones más estrictas en cada agente.

### Capa de Ejecución
Cuatro roles, siempre los mismos. Lo que cambia es su configuración.

## ---

## Los Cuatro Roles Unificados

En lugar de Scout / Archaeologist, Design Agent, Implementation Agent, Review Agent, el sistema unificado
tiene cuatro roles con nombres que expresan su responsabilidad independientemente del contexto:

### Understand
*Produce conocimiento sobre el terreno antes de actuar.*

En zona sana: explora la arquitectura existente, documenta capas, identifica patrones en uso. Output
principal: `ARCH.md` actualizado.

En zona comprometida (una o varias dimensiones): hace arqueología, reconstruye intención, identifica load-
bearing walls, mapea seams disponibles. Output principal: `ARCHAEOLOGY.md`, `INTENT.md`, actualización
del Health Map con mayor profundidad.

La diferencia no está en el rol — está en el **depth level** que el Context Assembler le asigna según el perfil
de la zona. El mismo agente con un skill distinto.

### Decide
*Produce una decisión de diseño documentada y revisable.*

En zona sana: analiza opciones, elige patrones, diseña interfaces, escribe el DDR.

En zona comprometida en legibilidad o alineación: añade al DDR la sección "Baby Step constraint" — el
cambio debe ser el paso más pequeño posible en la dirección correcta. Consulta `INTENT.md` para no
diseñar contra la intención original del sistema.

En zona comprometida en múltiples dimensiones: antes de diseñar la solución, diseña el *plan de
aproximación*: qué seams hay disponibles, qué cobertura de caracterización existe, qué partes del código
viejo deben sobrevivir durante la transición.

### Act
*Ejecuta la decisión dentro de los límites autorizados.*


En zona sana: implementa el DDR, respeta el scope, para y escala si encuentra algo fuera del DDR.

En zona con tests comprometidos: no puede tocar ningún fichero sin cobertura de caracterización previa. Si
no existe, su primer acto es generarla — y ese acto también es un DDR (pequeño, pero explícito).

En zona con impacto impredecible: el scope-enforcer se vuelve más restrictivo. Cualquier fichero no en el
DDR requiere checkpoint humano, no solo registro.

### Verify
*Audita el resultado contra el diseño, la arquitectura, y los principios.*

En zona sana: conformidad con DDR, SOLID, Clean Code, alineación arquitectónica.

En zona legacy: añade regression check (¿los tests de caracterización siguen pasando?), direction check (¿el
cambio acerca al objetivo arquitectónico?), y debt delta (¿la deuda neta del módulo ha subido o bajado?).

## ---

## El Context Assembler: el corazón del sistema

Este componente merece su propio análisis porque es donde ocurre la magia de la unificación. Su
responsabilidad es responder a una sola pregunta: **dado este agente, esta zona, y este objetivo, ¿qué
contexto necesita exactamente?**

El Context Assembler trabaja en tres pasos:

**1. Lee el perfil de la zona en el Health Map**
¿Qué dimensiones están comprometidas? ¿Ha validado el Director el análisis? ¿Hay ajustes manuales?

**2. Selecciona y compone los skills**
Hay skills que siempre se cargan (los principios SOLID, el catálogo de patrones), hay skills que se cargan si la
zona los requiere (el análisis de caracterización, el modo Baby Step, las instrucciones de Strangler Fig), y hay
skills específicos del proyecto (el ARCH.md actual, las CONVENTIONS, el DDR activo).

El Context Assembler no carga todos los skills disponibles — carga exactamente los que el agente necesita
para su rol en esa zona. Esto es crítico para no desperdiciar contexto y para no confundir al agente con
información irrelevante.

**3. Configura las extensions activas**


¿Plan-guard activo? ¿Scope-enforcer en modo estricto o normal? ¿Characterization-check habilitado?
¿Cuántos checkpoints intermedios? Cada extension tiene parámetros que el Context Assembler ajusta según
el perfil de la zona.

---

## El Pipeline Configurator: de flujo fijo a flujo adaptativo

En el sistema base, el flujo era fijo: Scout → Design → Implementation → Review. En el sistema unificado, el
flujo es **el mínimo necesario para operar responsablemente en esa zona**.

El Pipeline Configurator toma el perfil de salud de la zona y produce una secuencia de pasos. Hay pasos que
son siempre obligatorios:

- Understand (aunque sea ligero) antes de Decide
- Decide (aunque sea un micro-DDR) antes de Act
- Verify siempre después de Act

Y hay pasos que se insertan cuando el perfil los requiere:

- Understand profundo → cuando legibilidad o alineación están comprometidas
- Characterization Act → cuando los tests están comprometidos, antes del Act principal
- Seam Analysis → cuando el impacto es impredecible, como sub-paso de Understand
- Checkpoint intermedio → cuando múltiples dimensiones están comprometidas

El resultado es un pipeline que puede ser tan simple como tres pasos con un checkpoint, o tan elaborado
como ocho pasos con cuatro checkpoints, dependiendo del terreno. Pero siempre es la misma estructura
conceptual: entender, decidir, actuar, verificar.

---

## El Health Map como bisagra

El Health Map no es solo un diagnóstico — es el mecanismo de transición entre estados del sistema. Un
módulo no está para siempre en modo legacy. A medida que el sistema trabaja sobre él, su perfil de salud
cambia:

- Cuando el Characterization Act añade cobertura, la dimensión de confiabilidad de tests mejora
- Cuando el Act introduce un seam donde no había ninguno, la dimensión de predictibilidad mejora
- Cuando el Verify confirma que varios DDRs consecutivos han mejorado la alineación, esa dimensión mejora


El Health Map se actualiza automáticamente por el Verify Agent al final de cada ciclo, y manualmente por el
Director cuando tiene información que el análisis no puede capturar.

Esto crea una dinámica natural: **el sistema gradualmente libera sus propias restricciones** a medida que el
código sobre el que opera mejora. Un módulo que empezó requiriendo ocho pasos y cuatro checkpoints va
necesitando menos precauciones con cada iteración, hasta que eventualmente opera en modo base. Esa
transición no requiere ninguna acción explícita del Director — es una consecuencia del propio trabajo del
sistema.

---

## Cómo Conviven los Artefactos

Con el sistema unificado, `archbase/` se organiza en tres áreas:

**Área de conocimiento del sistema** — artefactos que todos los agentes leen:
`ARCH.md`, `ARCH_TARGET.md`, `PATTERNS.md`, `CONVENTIONS.md`, `CONSTRAINTS.md`,
`VOCABULARY.md`

**Área de salud del repo** — artefactos que el sistema actualiza y el Director supervisa:
`HEALTH_MAP.md`, `ARCHAEOLOGY.md`, `INTENT.md`, `DELTA.md`, `DEBT.md`, `METRICS.md`

**Área de trabajo activo** — artefactos del ciclo en curso:
`DECISIONS/` (DDRs), `TRIAGE.md`, `WORKFLOW_STATE.md`

La separación es importante porque refleja tres ritmos distintos:

- El área de conocimiento cambia despacio — cuando el Director actualiza restricciones o cuando el sistema
descubre algo fundamental sobre la arquitectura
- El área de salud cambia con cada ciclo de trabajo — refleja el estado real del repo en tiempo casi real
- El área de trabajo activo cambia con cada tarea — es el tablero del ciclo actual

---

## La Vista del Director

Desde el punto de vista del Director Humano, el sistema unificado funciona así:

1. **Expresa una intención:** "quiero añadir X" o "quiero mejorar Y" o "revisa Z"
2. **El sistema determina la zona afectada** y consulta su perfil en el Health Map
3. **El sistema configura el pipeline** apropiado para ese perfil


4. **El Director recibe checkpoints** donde necesita intervenir, con artefactos claros para revisar (un DDR, un
Audit Report, un análisis de riesgo)
5. **El Director aprueba, rechaza, o ajusta**, y el sistema continúa

En ningún momento el Director necesita saber si está operando en "modo base" o "modo legacy". Eso es un
detalle de implementación del sistema. Lo que el Director ve es que en algunos módulos el sistema le pide
más aprobaciones y le presenta más contexto previo — y eso tiene sentido intuitivo, porque esos módulos
son los que requieren más cuidado.

---

## Lo que la Unificación Resuelve

**Elimina la frontera artificial** entre repos "sanos" y repos "legacy". En la realidad, casi todos los repos son
sanos en algunas zonas y legacy en otras. Un sistema que trata el repo como una unidad homogénea opera
con el modo incorrecto en alguna parte.

**Elimina la explosión de tipos de agente**. En lugar de Scout + Archaeologist + Design Agent + Incremental
Design Agent + Implementation Agent + Characterization Agent + Review Agent + Legacy Review Agent, hay
cuatro roles que se configuran. Añadir un nuevo tipo de comportamiento no requiere un nuevo agente —
requiere un nuevo skill o una nueva extension.

**Hace el progreso visible y automático**. La mejora del código tiene una consecuencia directa en el
comportamiento del sistema: menos restricciones, menos checkpoints, más velocidad. Eso crea un incentivo
natural para mantener la calidad — no porque alguien lo supervise, sino porque el propio sistema trabaja
mejor en terreno sano.


