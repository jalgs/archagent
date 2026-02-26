# Skills, Extensions e Integración con Pi
### Diseño desde la experiencia del Director hacia atrás

---

## El Principio de Diseño de Esta Capa

Toda la complejidad del sistema debe ser invisible para el Director. Los skills y extensions son el mecanismo
por el que esa complejidad se encapsula. Si el Director necesita entender cómo funcionan los skills para
operar el sistema, el diseño ha fallado.

La consecuencia directa de este principio es que hay **una sola sesión Pi con la que el Director interactúa**:
la sesión del Orchestrator. Todos los demás agentes corren en sesiones separadas, coordinadas por el
Orchestrator, observables por el Director si quiere profundizar, pero no necesarias para operar.

El Director habla con el Orchestrator en lenguaje natural. El Orchestrator, a través de sus skills y extensions,
traduce esa intención en trabajo concreto y devuelve al Director exactamente lo que necesita revisar, en el
formato correcto, en el momento correcto.

---

## Las Dos Superficies de Interacción del Director

Antes de diseñar skills y extensions, es importante entender que el Director interactúa con el sistema de dos
formas cualitativamente distintas:

**Interacción fluida:** conversación con el Orchestrator. "Necesito añadir X", "revisa el módulo Y", "¿cuál es el
estado del proyecto?". El Orchestrator responde, hace preguntas si necesita clarificación, y lanza el trabajo.
Esta interacción es conversacional y no requiere conocimiento del sistema interno.

**Interacción estructurada:** revisión de artefactos en checkpoints. El sistema pausa y presenta al Director
un artefacto específico (un DDR, un Audit Report, un INTENT.md) con exactamente la información que
necesita para tomar una decisión binaria: aprobar, rechazar con comentario, o pedir más análisis. Esta
interacción es deliberada y sí requiere el juicio senior del Director.

Los skills y extensions se diseñan para servir a estas dos superficies. Los skills cargan el contexto correcto
en cada agente. Las extensions gestionan el ciclo de vida, los checkpoints, y la integridad del sistema entre
ambas superficies.

---


## Catálogo de Skills

Los skills se organizan en tres familias según su naturaleza. La familia determina quién los mantiene, con
qué frecuencia cambian, y cómo se componen.

## ---

### Familia 1: Skills de Conocimiento
*Genéricos, reutilizables entre proyectos, mantenidos por el equipo que mantiene el sistema.*

Estos skills no saben nada del proyecto concreto. Son el conocimiento de fondo que cualquier agente
necesita para razonar bien sobre arquitectura y código. Se cargan una vez y raramente cambian.

**`clean-architecture.skill`**
El modelo de capas de Clean Architecture operativizado para un agente: qué es la Dependency Rule, qué son
las capas (Entities, Use Cases, Interface Adapters, Frameworks), qué violaciones son detectables en código, y
—crucialmente— cómo se detectan en lenguajes y frameworks concretos donde los límites no son siempre
explícitos. Este skill incluye también variantes (Hexagonal, Ports & Adapters, Onion) porque el Decide Agent
necesita saber que Clean Architecture no es un dogma sino un espectro.

**`solid-principles.skill`**
No las definiciones abstractas de los principios SOLID — las definiciones operativas. Para cada principio: qué
señales en el código indican una violación, qué distingue una violación real de un falso positivo (no toda
clase grande viola SRP), y cómo se priorizan cuando hay tensión entre principios (y siempre hay tensión).
Este skill es el que hace que el Verify Agent produzca findings accionables y no simplemente listas de
potenciales problemas.

**`design-patterns.skill`**
El catálogo de patrones GoF y los principales Enterprise Patterns (Repository, Unit of Work, Domain Events,
Outbox, Saga, CQRS) con tres dimensiones para cada uno: cuándo usarlo, cuándo no usarlo, y qué señales en
el código indican que se está usando incorrectamente. La tercera dimensión es la más valiosa para el Verify
Agent.

**`clean-code.skill`**
Naming, tamaño de funciones, niveles de abstracción, gestión de errores, comentarios, duplicación. Diseñado
para producir observaciones específicas y localizables, no evaluaciones subjetivas. "Esta función tiene tres
niveles de abstracción distintos en el mismo bloque" es un finding accionable. "Este código no es limpio" no
lo es.

**`legacy-patterns.skill`**


Específico para el Understand Agent en modo profundo y para el Decide Agent en modo incremental.
Contiene: el catálogo de anti-patrones comunes en código legacy y cómo identificarlos, el patrón Strangler
Fig operativizado como conjunto de movimientos concretos, el concepto de seam y cómo identificar seams
disponibles en código existente, y las técnicas de caracterización de comportamiento.

---

### Familia 2: Skills de Contexto
*Específicos del proyecto, generados dinámicamente desde `archbase/`.*

Estos skills no son ficheros estáticos — son ensamblados en tiempo de ejecución por el Context Assembler a
partir del contenido actual de `archbase/`. Su contenido cambia a medida que el proyecto evoluciona.

**`project-arch.skill`**
Un wrapper que inyecta el contenido de `knowledge/ARCH.md` y `knowledge/ARCH_TARGET.md` (si existe)
en el prompt del agente, precedido de instrucciones sobre cómo interpretarlos. No es simplemente incluir el
fichero — es incluirlo con el encuadre correcto: "esta es la arquitectura actual del proyecto, toda propuesta de
diseño debe ser coherente con ella o proponer explícitamente cómo evoluciona".

**`project-constraints.skill`**
El contenido de `knowledge/CONSTRAINTS.md` inyectado con máxima prioridad. El encuadre que lo precede
es inequívoco: estas restricciones no son sugerencias, son invariantes del proyecto. Si una decisión de
diseño viola una restricción, la decisión es incorrecta, independientemente de sus méritos técnicos.

**`project-conventions.skill`**
El contenido de `knowledge/CONVENTIONS.md` inyectado con instrucciones claras para el Act Agent: todo
código producido debe seguir estas convenciones. Si hay una convención que entra en conflicto con una
decisión de diseño, reportar al Orchestrator antes de continuar.

**`project-vocabulary.skill`**
El contenido de `knowledge/VOCABULARY.md` inyectado con instrucciones específicas: cuando nombres
conceptos nuevos, usa los términos de este vocabulario. Si necesitas un término que no existe aquí, proponlo
en tu output para que el Director lo añada. Nunca uses términos técnicos donde existe un término del
dominio.

**`zone-context.skill`**
El análisis de la zona concreta sobre la que opera el agente: el perfil del Health Map, el fichero de
`health/zones/` si existe, y en modo legacy, el contenido relevante de `forensics/`. Este skill se ensambla por
zona, no por proyecto — dos agentes operando en dos zonas distintas tienen `zone-context.skill` distintos
aunque trabajen en el mismo repo.


**`active-ddr.skill`**
El DDR activo para el Act Agent. Solo existe cuando hay un DDR aprobado y un Act Agent activo. Su encuadre:
este es el único diseño que tienes autorización para implementar. Cualquier cosa fuera de este documento
requiere parar y consultar.

---

### Familia 3: Skills de Rol
*Definen el comportamiento del agente, independientemente del proyecto.*

Estos skills son los que convierten a Pi en un agente especializado. No contienen conocimiento técnico —
contienen instrucciones sobre cómo debe razonar, qué debe producir, cuándo debe parar, y cómo debe
comunicarse.

**`understand-role.skill`**
Instrucciones para el Understand Agent: el protocolo de exploración (estructura de directorios → interfaces
públicas → implementaciones → tests → dependencias), el formato de output esperado, cuándo activar el
modo profundo vs. el modo rápido, y —crítico— cómo distinguir entre lo que el código hace y lo que intenta
hacer. También incluye la instrucción de no proponer soluciones: el Understand Agent describe, no prescribe.

**`understand-deep-role.skill`**
Extensión del anterior para modo arqueológico. Añade el protocolo forense: cómo leer el historial de
commits para inferir intención, cómo identificar dialectos de código, cómo detectar load-bearing walls, y
cómo documentar la incertidumbre de forma honesta (cada sección de INTENT.md tiene un nivel de
confianza explícito).

**`decide-role.skill`**
Instrucciones para el Decide Agent: el protocolo de análisis de opciones (siempre al menos dos alternativas
evaluadas explícitamente), el formato del DDR, cuándo una propuesta de diseño es suficientemente concreta
para ser un DDR (si el Act Agent no puede implementarla sin tomar decisiones de diseño, no es lo
suficientemente concreta), y cómo escalar cuando el análisis revela que el problema es más grande de lo que
el objetivo inicial sugería.

**`decide-incremental-role.skill`**
Extensión del anterior para zonas legacy. Añade el Baby Step constraint como evaluación obligatoria, la
sección "qué no cambia" como campo requerido del DDR, y la instrucción de consultar DELTA.md para
verificar la dirección del cambio antes de proponer cualquier diseño.

**`act-role.skill`**
Instrucciones para el Act Agent: el scope del DDR es el límite absoluto, el protocolo para cuando encuentra
algo inesperado (parar, documentar, reportar al Orchestrator — nunca "arreglarlo de paso"), y cómo comunicar


el progreso de forma que el Director pueda seguirlo sin necesidad de leer el código.

**`verify-role.skill`**
Instrucciones para el Verify Agent: las dimensiones de auditoría ordenadas por prioridad, la escala de
severidad (blocking vs. advisory), el formato del Audit Report, y cómo distinguir entre un problema real y un
falso positivo generado por aplicar un principio dogmáticamente sin entender el contexto.

**`orchestrator-role.skill`**
Las instrucciones del Orchestrator son las más importantes del sistema porque determinan la experiencia
del Director. Este skill define: cómo descomponer un objetivo de alto nivel en zonas y agentes, cuándo lanzar
agentes en paralelo vs. secuencialmente, cómo presentar los checkpoints al Director (qué incluir, qué omitir,
cómo encuadrar la decisión), cómo gestionar un rechazo del Director con comentarios, y cómo responder
preguntas de estado sin abrumar con detalle interno.

---

## El Skill de Composición: cómo se cargan juntos

El Context Assembler no carga skills individualmente — los compone en un único skill ensamblado por
agente, zona y fase. El orden de composición importa:

```

1. Role skill          → quién eres y cómo operas (base)
2. Knowledge skills    → lo que sabes en abstracto
3. Project-context     → constraints y conventions (alta prioridad, sobrescriben cualquier
conocimiento genérico que las contradiga)
4. Zone-context        → el terreno concreto
5. Active-DDR          → el encargo concreto (solo Act Agent)
```

Una instrucción en `project-constraints.skill` siempre gana a una en `clean-architecture.skill`. Eso es
intencional: el Director puede sobrescribir cualquier principio genérico con una restricción específica del
proyecto, y el sistema lo respeta.

---

## Catálogo de Extensions

Las extensions son el sistema nervioso del sistema: gestionan el ciclo de vida, protegen los invariantes, y
reducen la fricción del Director automatizando todo lo que no requiere su juicio.


## ---

**`plan-guard`**
*Protege la integridad de los agentes de solo lectura.*

Intercepta cualquier llamada a las herramientas `write` y `edit` del Understand Agent y verifica que el destino
está dentro de `archbase/`. Si no, bloquea la operación y la registra como anomalía. Esto no es solo una
salvaguarda — es lo que permite al Director confiar en que el Understand Agent nunca tocará código de
producción, sin tener que verificarlo manualmente.

**`scope-enforcer`**
*Garantiza que el Act Agent opera exactamente dentro del DDR.*

Antes de cada `write` o `edit`, verifica que el fichero está en la lista de ficheros autorizados del DDR activo.
Hay dos modos:

- *Modo normal* (zona sana): si el fichero no está en el DDR, registra el intento y pide confirmación antes de
continuar.
- *Modo estricto* (zona con impacto impredecible): si el fichero no está en el DDR, bloquea la operación y
crea un checkpoint inmediato para el Director.

El Director puede configurar el modo por zona en `knowledge/CONSTRAINTS.md`.

**`checkpoint`**
*La extensión más importante para la experiencia del Director.*

Implementa los puntos de control humanos como ciudadanos de primera clase del sistema. Cuando el
Pipeline Configurator determina que un checkpoint es necesario, esta extension pausa el flujo y presenta al
Director un paquete de revisión que contiene: el artefacto a revisar, el contexto mínimo necesario para
entenderlo, y exactamente tres opciones posibles.

Las tres opciones siempre son las mismas: **Aprobar**, **Rechazar con comentario**, o **Pedir análisis
adicional**. No hay más opciones. La simplicidad es intencional: un checkpoint que requiere que el Director
tome una decisión compleja no es un checkpoint bien diseñado — es una decisión de diseño que el Decide
Agent debería haber tomado.

El comentario en un rechazo no es texto libre que el sistema ignora. La extension lo parsea y lo inyecta como
contexto en el siguiente ciclo del agente que produjo el artefacto rechazado. El Director no necesita
reformatear su feedback — escribe en lenguaje natural y la extension lo convierte en contexto estructurado.

**`archbase-integrity`**


*Mantiene la consistencia entre artefactos de `archbase/`.*

Monitoriza escrituras en `archbase/` y detecta cuando un cambio invalida potencialmente otro artefacto
dependiente. Por ejemplo: si ARCH.md cambia, marca como "pendiente de revisión" todos los DDRs activos
que referencian zonas afectadas por el cambio. No bloquea el trabajo — pero el Director verá en el próximo
checkpoint una notificación de que hay artefactos que pueden necesitar revisión.

También mantiene `decisions/_index.md` sincronizado automáticamente con los DDRs existentes. El Director
nunca necesita actualizar el índice manualmente.

**`health-tracker`**
*Actualiza el Health Map como efecto secundario del trabajo.*

Al final de cada ciclo Verify, lee el Audit Report producido y actualiza automáticamente el perfil de la zona en
`health/HEALTH_MAP.md`. Calcula si la dimensión ha mejorado, empeorado, o se ha mantenido según los
findings. Si hay un override del Director que entra en conflicto con la actualización calculada, notifica al
Director la discrepancia en lugar de sobreescribir el override silenciosamente.

**`context-budget`**
*Protege la calidad del razonamiento en sesiones largas.*

Monitoriza el uso de contexto de cada agente. Cuando se acerca al límite, no simplemente trunca — ejecuta
una compactación inteligente: preserva el role skill completo, los project-constraints completos, el DDR
activo completo (para el Act Agent), y comprime el historial de razonamiento intermedio en un resumen. El
agente nunca sabe que ocurrió la compactación — su capacidad de razonar sobre las restricciones
importantes se preserva.

**`session-observer`**
*Hace el trabajo de los agentes observable para el Director sin requerir su atención constante.*

Mantiene un log estructurado de cada sesión de agente que el Director puede consultar cuando quiera. El log
tiene dos vistas: una vista de "decisiones tomadas" (qué decidió el agente y por qué) y una vista de
"actividad" (qué ficheros leyó, qué escribió, qué herramientas usó). El Director puede revisar la vista de
decisiones de cualquier agente pasado sin necesidad de leer la transcripción completa de la sesión.

Esta extension es la que implementa la observabilidad que Pi ofrece de forma nativa pero que requiere
estructura para ser útil a escala.

## ---

## La Experiencia del Director: cómo se ve todo esto desde afuera


Con este diseño, la experiencia del Director en un día de trabajo normal se parece a esto:

El Director abre la sesión del Orchestrator y dice: *"Necesitamos implementar la exportación de informes en
PDF. Afecta al módulo de reporting."*

El Orchestrator consulta el Health Map del módulo de reporting, ve que tiene dos dimensiones
comprometidas (tests y alineación), y responde: *"El módulo de reporting tiene cobertura de tests
insuficiente. Antes de diseñar la feature, necesito añadir characterization tests sobre el comportamiento de
exportación actual. Eso tomará un ciclo previo. ¿Procedo?"*

El Director dice que sí. El sistema lanza el ciclo de caracterización de forma autónoma. Cuando termina, el
checkpoint le presenta al Director: *"He añadido cobertura de caracterización sobre los 3 flujos de
exportación existentes. Aquí está el resumen de qué comportamientos quedan capturados. ¿Apruebas y
continúo con el diseño?"*

El Director aprueba. El sistema lanza el Decide Agent. Cuando el DDR está listo, el checkpoint presenta:
*"Propuesta de diseño para exportación PDF. He evaluado dos opciones: generación en-proceso vs.
generación asíncrona. Recomiendo asíncrona porque el módulo de reporting ya tiene un patrón de tareas en
background que podemos extender [referencia a PATTERNS.md]. El cambio es un Baby Step: no toca el
código de exportación existente, solo añade un nuevo handler. ¿Apruebas?"*

El Director lee el DDR, lo aprueba con un comentario: *"Bien, pero asegúrate de que el handler nuevo usa el
mismo mecanismo de retry que los handlers existentes."* La extension checkpoint inyecta ese comentario
como restricción adicional en el contexto del Act Agent.

El Act Agent implementa. El Verify Agent audita. Si todo está bien, el Director recibe: *"Implementación
completada. Audit Report: sin blocking issues. Un advisory: el nombre del handler nuevo no sigue la
convención de naming documentada en CONVENTIONS.md. He registrado el advisory en DEBT.md."* El
Director decide si corregirlo ahora o dejarlo en el backlog.

En ningún momento el Director tuvo que saber qué agente estaba activo, qué skills se cargaron, ni cómo
funciona el scope-enforcer. Tomó tres decisiones: proceder con la caracterización, aprobar el DDR con una
restricción, y dejar el advisory para después. Todo lo demás fue transparente.

---

## El Modelo de Composición por Agente

Resumen de qué skills y extensions se cargan por agente:


## ```

## ORCHESTRATOR

Skills:   orchestrator-role + project-constraints + project-arch
Ext:      checkpoint + archbase-integrity + session-observer

UNDERSTAND (modo rápido)
Skills:   understand-role + knowledge-skills + project-constraints + zone-context
Ext:      plan-guard + health-tracker + session-observer

UNDERSTAND (modo profundo / arqueológico)
Skills:   understand-deep-role + knowledge-skills + legacy-patterns
+ project-constraints + zone-context
Ext:      plan-guard + health-tracker + session-observer

DECIDE (modo normal)
Skills:   decide-role + knowledge-skills + project-arch + project-constraints
+ project-vocabulary + zone-context
Ext:      plan-guard + archbase-integrity + session-observer

DECIDE (modo incremental / legacy)
Skills:   decide-incremental-role + knowledge-skills + legacy-patterns
+ project-arch + project-constraints + project-vocabulary + zone-context
Ext:      plan-guard + archbase-integrity + session-observer

ACT
Skills:   act-role + project-conventions + project-constraints + zone-context
+ active-ddr
Ext:      scope-enforcer + context-budget + session-observer

VERIFY
Skills:   verify-role + knowledge-skills + project-arch + project-constraints
+ zone-context
Ext:      health-tracker + archbase-integrity + session-observer
```

El patrón es visible: `project-constraints` aparece en todos sin excepción. `session-observer` también. El
Director siempre puede observar, y las restricciones siempre están presentes. Todo lo demás varía según el
rol y el terreno.


