# Evolución y Aprendizaje del Sistema
### Cómo archbase/ madura, cómo el sistema mejora su precisión, y cómo evitar que se convierta en
burocracia

---

## El Problema Central de Este Paso

Un sistema que genera artefactos indefinidamente sin mecanismo de poda se convierte en deuda
documental. `archbase/` puede llegar a tener cientos de DDRs, un `DEBT.md` de miles de líneas, y un
`HEALTH_MAP.md` con datos de hace seis meses que nadie ha revisado. En ese estado, el Context
Assembler inyecta contexto obsoleto en los agentes, y el sistema empieza a tomar decisiones basadas en
una realidad que ya no existe.

El aprendizaje del sistema no es solo acumular conocimiento — es **mantener el conocimiento relevante y
desechar el que ha caducado**. Esos son dos mecanismos distintos que hay que diseñar por separado.

## ---

## Mecanismo 1: Actualización Reactiva
*El sistema aprende como efecto secundario del trabajo*

Este es el mecanismo más simple y más importante. Cada ciclo completo (Understand → Decide → Act →
Verify) produce observaciones sobre el repo que deben reflejarse en `archbase/` antes del siguiente ciclo.

### Qué actualiza cada agente al terminar

**El Verify Agent** es el principal contribuidor a la evolución del sistema. Al final de cada ciclo, el
Orchestrator lee el Audit Report que el Verify Agent escribió en `archbase/` y ejecuta tres actualizaciones
deterministas en TypeScript:

Primera: actualiza el perfil de salud de la zona en `HEALTH_MAP.md`. La lógica es concreta: si el Audit Report
tiene cero blocking issues y menos de N advisories en la dimensión X, el estado de esa dimensión mejora un
nivel. Si tiene blocking issues, empeora. Si hay regression failures, la dimensión de tests baja a
"comprometido" inmediatamente, sin gradación.

Segunda: añade entradas a `DEBT.md` por cada advisory issue del Audit Report que no esté ya registrado. El
Orchestrator hace la deduplicación: compara los advisories nuevos contra las entradas existentes de
`DEBT.md` por localización y tipo antes de escribir.


Tercera: actualiza el `decisions/_index.md` con el nuevo estado del DDR activo: pasa de "aprobado" a
"implementado", con timestamp y referencia al Audit Report.

**El Understand Agent** en modo profundo puede proponer actualizaciones a `ARCH.md` y a
`health/zones/`. Las escribe directamente — no necesita aprobación del Director para `health/zones/`, pero sí
para `ARCH.md`. El mecanismo: el Understand Agent escribe su propuesta en un fichero temporal
`archbase/workflow/arch-update-proposal.md`, y el Orchestrator lo convierte en un checkpoint para el
Director antes de aplicar el cambio a `ARCH.md`.

**El Act Agent** no actualiza `archbase/` directamente salvo una excepción: si durante la implementación
descubre algo que invalida el DDR (una dependencia no documentada, un comportamiento del código que el
Decide Agent no vio), escribe una nota en `archbase/workflow/WORKFLOW_STATE.md` y el Orchestrator
detiene el pipeline para crear un checkpoint. El Director decide si reactivar el Decide Agent o continuar con
las restricciones ajustadas.

### Implementación concreta

El Orchestrator tiene una función `postCycleUpdate(auditReport, zone)` que se ejecuta después de que cada
sesión del Verify Agent termina:

```
postCycleUpdate:

1. Lee archbase/workflow/audit-report-current.md
2. Parsea los findings por dimensión y severidad
3. Calcula el delta de salud de la zona
4. Escribe el delta en HEALTH_MAP.md (lectura → modificación → escritura)
5. Extrae advisories nuevos → append a DEBT.md
6. Actualiza _index.md con estado del DDR
7. Limpia archbase/workflow/ de artefactos del ciclo terminado
```

Todo esto es lógica TypeScript que opera sobre ficheros Markdown. Sin LLMs. Sin ambigüedad. Determinista
y testeable.

---

## Mecanismo 2: Actualización Proactiva
*El sistema detecta cuándo su conocimiento ha envejecido*

El Health Map tiene un campo de timestamp por zona. El Orchestrator, al inicio de cada tarea, comprueba si
el análisis de la zona afectada tiene más de N días o más de M commits desde el último análisis. Si sí, marca


la zona como "stale" y configura el pipeline para que incluya un Understand rápido antes de continuar.

El valor de N y M no es un número mágico — está en `knowledge/CONSTRAINTS.md` como parámetro
configurable por el Director. Un equipo que hace deploys diarios necesita N más pequeño que un equipo con
releases mensuales.

### El Commit Delta como señal de envejecimiento

El Orchestrator tiene acceso a `bash` a través del Act Agent, pero más directamente puede ejecutar git
commands directamente desde TypeScript via `child_process`. Al inicio de cada tarea, ejecuta:

```bash
git log --oneline archbase/ --since="$(cat archbase/health/HEALTH_MAP.md | grep 'last-analysis' | ...)"
```

Si hay commits en los ficheros de la zona desde el último análisis, el Health Map se marca como
potencialmente stale. No automáticamente incorrecto — potencialmente stale. El Orchestrator informa al
Director: *"Han habido 12 commits en el módulo de facturación desde el último análisis. ¿Quieres que
actualice el Health Map antes de continuar?"*

Esta pregunta no bloquea si el Director dice que no. Simplemente queda registrado que el Director eligió
operar con un Health Map potencialmente desactualizado.

## ---

## Mecanismo 3: Cierre de Deuda
*Las entradas de DEBT.md que ya no existen deben desaparecer*

`DEBT.md` solo es útil si refleja la deuda real. Una entrada de deuda que ya fue resuelta pero sigue en el
fichero contamina la visión del Director y carga contexto innecesario al Decide Agent.

El mecanismo de cierre tiene dos caminos:

**Cierre automático:** cuando el Orchestrator procesa un Audit Report, busca en `DEBT.md` entradas cuya
localización coincide con ficheros que el Act Agent acaba de modificar, y que son del tipo que el DDR
declaraba resolver. Si el Audit Report no menciona esa deuda en sus findings, la entrada se marca como
"cerrada" con fecha y referencia al DDR. No se elimina — se archiva en una sección `[Closed]` al final del
fichero. El historial de qué deuda existió y cuándo se resolvió es conocimiento institucional.

**Cierre manual:** el Director puede cerrar entradas de `DEBT.md` directamente. El Orchestrator expone un
comando simple para esto — no hace falta editar el fichero a mano.


### La purga periódica de `[Closed]`

Cada N meses (configurable en `CONSTRAINTS.md`), el Orchestrator propone al Director una purga: mover
las entradas `[Closed]` de `DEBT.md` a un fichero de archivo `archbase/health/debt-archive-YYYY.md`. El
fichero principal queda limpio. El historial queda disponible si alguna vez hace falta.

## ---

## Mecanismo 4: Madurez Progresiva de DDRs
*Los DDRs envejecen de forma diferente según su tipo*

No todos los DDRs envejecen igual. Un DDR sobre la estructura de capas del sistema puede ser relevante
durante años. Un DDR sobre cómo implementar un endpoint concreto puede volverse obsoleto en semanas
si el módulo se refactoriza.

El `decisions/_index.md` tiene un campo de "tipo de DDR" con tres valores posibles:

**Estructural:** decisiones sobre arquitectura del sistema, patrones fundamentales, contratos entre módulos.
Estos DDRs no caducan por el paso del tiempo — caducan cuando el Director los supercede explícitamente.
El Decide Agent los carga siempre como contexto.

**Táctico:** decisiones sobre implementación de una feature concreta dentro de los límites de la
arquitectura. Estos DDRs pasan a "archivado" automáticamente cuando el Verify Agent confirma que el
trabajo está completo y el Orchestrator ha ejecutado `postCycleUpdate`. Ya no se cargan como contexto
activo, pero el Decide Agent puede consultarlos si trabaja en la misma zona.

**Exploratorio:** decisiones tomadas en condiciones de incertidumbre, marcadas explícitamente como
"provisional". Tienen una fecha de expiración: si en N días no han sido confirmadas o supercedidas, el
Orchestrator notifica al Director que hay un DDR exploratorio pendiente de revisión. Este mecanismo evita
que decisiones provisionales se vuelvan permanentes por inercia.

## ---

## Mecanismo 5: El Vocabulario como Señal de Madurez
*VOCABULARY.md como indicador de comprensión del dominio*

Hay un indicador de madurez del sistema que no suele tenerse en cuenta: la riqueza del `VOCABULARY.md`.
Un sistema que lleva meses trabajando en un repo debería tener un vocabulario del dominio rico y preciso. Si
`VOCABULARY.md` sigue siendo escaso después de muchos ciclos, hay un problema: o el Understand Agent


no está extrayendo términos del dominio, o el código no usa lenguaje del dominio (que es en sí mismo una
señal de deuda).

El Orchestrator trackea el tamaño y la tasa de crecimiento de `VOCABULARY.md` como una de las métricas
en `METRICS.md`. Una tasa de crecimiento que se acerca a cero después de los primeros meses es normal y
sana — el dominio está bien capturado. Una tasa que nunca despega es una señal de alerta que el Director
debería ver.

---

## Mecanismo 6: La Sesión del Director como Fuente de Aprendizaje
*Lo que el Director dice en lenguaje natural como entrada al sistema*

Cuando el Director rechaza un DDR con un comentario — *"esto viola nuestra decisión de no usar herencia en
el módulo de dominio"* — ese comentario contiene conocimiento que probablemente debería estar en
`CONSTRAINTS.md`. El Director lo sabe pero no lo escribió porque en el momento de crear el proyecto
parecía obvio.

El Orchestrator, tras un rechazo con comentario, hace una pregunta simple: *"Este feedback parece una
restricción del proyecto. ¿Quieres que lo añada a CONSTRAINTS.md para que todos los agentes lo tengan en
cuenta en el futuro?"* Si el Director dice que sí, el Orchestrator escribe la restricción con fecha y referencia al
DDR rechazado como contexto.

Esto es aprendizaje activo: el sistema convierte el feedback del Director en conocimiento persistente, con su
autorización explícita. No infiere restricciones por su cuenta — pregunta antes de escribir.

---

## Cómo Evitar que archbase/ se Convierta en Burocracia

Estas son las tres reglas que el Orchestrator aplica para mantener `archbase/` útil:

**Regla 1: Ningún artefacto crece sin límite.** Cada fichero tiene un tamaño máximo configurado en
`CONSTRAINTS.md`. Cuando `DEBT.md` supera N líneas, el Orchestrator avisa al Director y propone la purga
de entradas cerradas. Cuando `decisions/` supera N DDRs activos, el Orchestrator sugiere archivar los
tácticos más antiguos que estén en estado "implementado". El Director decide, pero el sistema avisa.

**Regla 2: El Context Assembler tiene presupuesto de tokens.** Al construir el `appendSystemPrompt` para
cada agente, el Context Assembler tiene un límite máximo de tokens (configurable). Cuando hay más
contexto disponible que presupuesto, aplica una jerarquía de prioridad: `CONSTRAINTS.md` siempre entra


completo, `ARCH.md` entra completo si el agente es Decide o Verify, los DDRs relevantes entran en orden de
recencia, y el resto se trunca. El agente nunca recibe un contexto que lo confunda por exceso de información.

**Regla 3: Si un artefacto no se ha leído en N ciclos, es candidato a archivo.** El Orchestrator trackea qué
ficheros de `archbase/` han sido cargados como contexto en los últimos N ciclos. Los que no han sido
cargados se reportan al Director en la revisión periódica. Un fichero que nadie lee no está ayudando —
probablemente está desactualizado o es redundante.

---

## La Revisión Periódica: el Único Ritual Activo del Director

Todo lo anterior ocurre de forma autónoma o como consecuencia de trabajo normal. Pero hay un ritual que
requiere la atención activa del Director: la **revisión periódica de `archbase/`**.

Cada N semanas (configurable), el Orchestrator prepara un informe de estado de `archbase/` y lo presenta al
Director como un checkpoint especial. Este informe contiene:

- Artefactos que han crecido por encima de su límite y necesitan poda
- DDRs exploratorios que han expirado sin confirmación
- Zonas del Health Map marcadas como stale con más de M semanas de antigüedad
- Entradas de `DEBT.md` que llevan más de X semanas en el backlog sin movimiento
- `VOCABULARY.md` y `CONSTRAINTS.md`: propuestas de nuevas entradas inferidas del trabajo reciente,
pendientes de aprobación del Director

El Director revisa este informe, toma decisiones sobre cada punto, y el Orchestrator aplica los cambios. La
revisión periódica es la sesión donde el Director ejerce control editorial sobre la memoria institucional del
sistema.

**Tiempo estimado de esta revisión:** 15-30 minutos. Si tarda más, el sistema está generando demasiado
ruido y hay que ajustar los umbrales.

## ---

## La Señal más Importante de que el Sistema Está Funcionando

No es el número de DDRs generados ni el tamaño de `archbase/`. Es esta: **el tiempo que el Decide Agent
tarda en producir un DDR va disminuyendo a medida que el proyecto madura**.

Al principio, el Decide Agent necesita explorar mucho porque `archbase/` es escaso. Con el tiempo,
`ARCH.md` está completo, `PATTERNS.md` documenta los patrones reales del proyecto, `CONSTRAINTS.md`


refleja las restricciones reales, y `DECISIONS/` tiene el historial de decisiones previas para contexto. El
Decide Agent encuentra respuestas en `archbase/` en lugar de inferirlas del código.

Ese es el indicador de madurez del sistema: no la cantidad de documentación, sino la velocidad con la que
los agentes pueden operar bien porque el contexto está disponible y es fiable.


