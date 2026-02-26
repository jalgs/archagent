# El Modelo de Detección
### Cómo el sistema decide en qué terreno está antes de operar

---

## Decisión de Diseño #1: No es binario

La primera tentación es diseñar una compuerta: *¿es legacy o no?* Si es legacy, activamos el Archaeologist.
Si no, activamos el Scout. Limpio, simple, implementable.

Es el diseño equivocado.

Un repo real no es legacy o sano — **tiene zonas**. El módulo de autenticación puede ser código de 2015 sin
tests, el módulo de facturación puede estar recién refactorizado con arquitectura limpia, y el módulo de
notificaciones puede estar a medio camino entre ambos. Si el sistema toma una decisión global sobre el
repo, va a operar con el modo incorrecto en dos de esos tres módulos.

**Decisión adoptada:** la detección es un **mapa de salud por zona**, no una etiqueta sobre el repo. El
resultado de la detección es un conjunto de zonas, cada una con su nivel de salud, y el sistema selecciona el
modo de operación *por zona* cuando trabaja en ella.

---

## Decisión de Diseño #2: No es una puntuación, es un perfil

La segunda tentación es calcular una puntuación numérica de salud: cobertura de tests + complejidad
ciclomática + acoplamiento = 73/100. También es el diseño equivocado.

Una puntuación colapsa dimensiones que tienen significados muy distintos. Un módulo con 90% de
cobertura pero tests que solo prueban getters puede puntuar alto y ser completamente inmanejable. Un
módulo con 20% de cobertura pero con tests de integración sobre los flujos críticos puede ser más seguro de
tocar que el anterior.

Lo que el sistema necesita no es saber *cuánto* de sano está una zona, sino *en qué dimensiones* está
comprometida y *qué implica eso para operar en ella*.

**Decisión adoptada:** la detección produce un **perfil de salud por dimensión**, no una puntuación
agregada. Cada dimensión responde a una pregunta operativa: ¿puedo navegar este código?, ¿puedo confiar
en los tests?, ¿puedo predecir el impacto de un cambio?, ¿respeta las capas que pretende respetar?


## ---

## Las Cuatro Dimensiones del Perfil

Estas dimensiones no se eligen por ser las más comunes en métricas de código — se eligen porque cada una
responde a una pregunta que el sistema necesita responder antes de operar.

### Dimensión 1: Legibilidad estructural
*¿Puede un agente (o un humano) navegar este código y entender su intención sin ejecutarlo?*

Señales negativas: funciones largas que hacen múltiples cosas, naming sin semántica de dominio (process(),
handleData(), doStuff()), ausencia de abstracción (lógica de negocio mezclada con infraestructura en el
mismo bloque), comentarios que explican el *qué* en vez del *por qué*.

**Implicación operativa:** si esta dimensión está comprometida, el Design Agent va a malinterpretar el
código existente. Su output será un DDR basado en suposiciones incorrectas sobre lo que hace el sistema.

### Dimensión 2: Confiabilidad de los tests
*¿Los tests existentes son una red de seguridad real o una ilusión de seguridad?*

Señales negativas: alta cobertura sobre código trivial, tests que verifican implementación (mockeando
detalles internos) en lugar de comportamiento observable, tests que fallan por razones no relacionadas con
lo que prueban, ausencia total de tests sobre los flujos críticos del negocio.

Esta es la dimensión más traidora. Un repo con 80% de cobertura puede ser más peligroso de tocar que uno
con 30%, si esa cobertura es falsa. El sistema necesita distinguir cobertura real de cobertura cosmética.

**Implicación operativa:** si esta dimensión está comprometida, el Implementation Agent no tiene red de
seguridad. Cada cambio es potencialmente una bomba de relojería. El Characterization Test Agent se vuelve
obligatorio antes de cualquier intervención.

### Dimensión 3: Predictibilidad del impacto
*¿Puedo predecir qué se rompe si cambio X?*

Señales negativas: acoplamiento aferente alto (muchos módulos dependen de este), estado global
compartido, efectos laterales ocultos (una llamada que parece de lectura que en realidad escribe),
dependencias circulares, herencia profunda con override de comportamiento no documentado.

Esta dimensión captura los "load-bearing walls" del sistema: código que no parece importante pero del que
depende casi todo. Son los lugares donde el mayor riesgo está escondido bajo la mayor apariencia de
inocencia.


**Implicación operativa:** si esta dimensión está comprometida, el Review Agent no puede hacer un
regression check fiable. El Archaeologist debe identificar explícitamente los load-bearing walls antes de que
cualquier otro agente opere cerca de ellos.

### Dimensión 4: Alineación arquitectónica
*¿El código respeta las capas y contratos que pretende respetar?*

Señales negativas: dependencias que van en la dirección incorrecta (infraestructura siendo importada desde
dominio), reglas de negocio en controladores o en SQL, lógica de presentación con acceso directo a base de
datos, módulos que nominalmente están separados pero comparten estado mutable.

Esta dimensión es la única que requiere un referente: ¿alineación con respecto a qué? Si no hay arquitectura
declarada, el Archaeologist tiene que inferir la arquitectura *implícita* (la que el código *intenta* tener,
imperfectamente) y medir la desviación respecto a esa.

**Implicación operativa:** si esta dimensión está comprometida, el Design Agent necesita el modo
incremental: cada DDR debe ser un Baby Step que no empeore la alineación, no necesariamente que la
perfeccione.

---

## Decisión de Diseño #3: Quién hace la detección y cuándo

Aquí hay una tensión real entre dos opciones:

**Opción A:** La detección es una fase separada, ejecutada por un agente dedicado, que produce el mapa de
salud antes de cualquier otra operación. El sistema no puede operar en una zona hasta que esa zona haya
sido mapeada.

**Opción B:** La detección es continua y emergente. Cada agente, al operar en una zona, actualiza el mapa
de salud de esa zona como efecto secundario de su trabajo.

La Opción A da garantías y evita que el sistema opere a ciegas, pero introduce latencia y puede ser costosa
en repos grandes. La Opción B es más ágil pero puede llevar al sistema a operar en zonas que aún no
entiende bien.

**Decisión adoptada:** un modelo híbrido en dos velocidades.

**Detección rápida (eager):** cuando el sistema entra por primera vez en un repo o en una zona no visitada,
hace un análisis ligero de las cuatro dimensiones. No exhaustivo — suficiente para saber si hay señales de


alarma que requieren precaución. Esto tarda minutos, no horas, y desbloquea la operación con las
salvaguardas apropiadas activas.

**Detección profunda (lazy):** el análisis exhaustivo de una zona se hace en background o se activa
explícitamente por el Director cuando va a intervenir en esa zona de forma significativa. Este análisis
alimenta el mapa completo y puede revisar conclusiones de la detección rápida.

## ---

## Decisión de Diseño #4: El Director Humano puede discrepar

El mapa de salud producido por la detección es una hipótesis, no un veredicto. Hay información que ningún
análisis estático puede capturar: que ese módulo aparentemente simple tiene una regla de negocio crítica
que nadie documentó, que ese código aparentemente caótico en realidad tiene una lógica muy clara una vez
que conoces el contexto histórico, que esos tests que parecen inútiles en realidad capturan un bug que tardó
meses en encontrarse.

El Director Humano puede, en cualquier momento, ajustar el perfil de una zona. Puede marcar una zona como
más peligrosa de lo que el análisis sugiere, o más segura. Esos ajustes se persisten en `archbase/` y tienen
precedencia sobre el análisis automático.

**Esto no es un override de emergencia — es parte del flujo normal.** El valor de un arquitecto senior sobre
un sistema de detección automatizado es precisamente ese contexto histórico y ese conocimiento del
negocio que no está en el código. El sistema debe facilitarlo, no ignorarlo.

---

## El Resultado de la Detección: el Health Map

La detección produce un artefacto llamado **Health Map**: una representación del repo como conjunto de
zonas, cada una con su perfil en las cuatro dimensiones.

Conceptualmente, cada zona tiene:

- Su identidad (qué módulo o área cubre)
- Su perfil de salud (las cuatro dimensiones, cada una en un estado: sano / atención / comprometido)
- Las implicaciones operativas derivadas (qué agentes se activan, qué precauciones son obligatorias)
- El nivel de confianza del análisis (rápido o profundo, con o sin validación humana)
- Si el Director ha ajustado alguna dimensión manualmente

El Health Map no es estático. Se actualiza cuando el Archaeologist hace un análisis profundo, cuando el
Review Agent detecta algo que el mapa no reflejaba, y cuando el Director ajusta su lectura. Es un artefacto


vivo como `ARCH.md`, no un resultado de una ejecución puntual.

## ---

## Cómo el Health Map Activa los Modos de Operación

El Health Map es el input del Orchestrator para decidir qué agentes activa y con qué configuración. La lógica
es:

**Todas las dimensiones sanas:** modo base. Scout → Design → Implementation → Review, sin
precauciones adicionales.

**Legibilidad estructural comprometida:** el Archaeologist hace un análisis previo de la zona antes de que el
Design Agent opere en ella. El Design Agent carga ese análisis como contexto obligatorio.

**Confiabilidad de tests comprometida:** el Characterization Test Agent es prerequisito antes de que el
Implementation Agent toque cualquier fichero de esa zona.

**Predictibilidad del impacto comprometida:** el Archaeologist identifica los load-bearing walls de la zona. El
scope-enforcer del Implementation Agent se vuelve más restrictivo: cualquier fichero no explícitamente
autorizado en el DDR requiere confirmación humana, no solo registro.

**Alineación arquitectónica comprometida:** el Design Agent activa el modo incremental. Los DDRs incluyen
sección obligatoria de "dirección arquitectónica". El Review Agent activa el direction check.

**Múltiples dimensiones comprometidas:** el Orchestrator eleva el nivel de checkpoints humanos. En lugar
de checkpoint al aprobar el DDR y al aceptar el Audit Report, añade checkpoints intermedios según el perfil
concreto de la zona.

---

## Lo Que el Modelo de Detección No Hace

Es igual de importante definir los límites. El modelo de detección no juzga si el código es bueno o malo —
solo describe en qué estado está y qué implica operar en él. No prioriza qué zonas atacar primero (eso es el
Triage, que viene después). No propone soluciones (eso es el Design Agent). No evalúa si el comportamiento
del código es correcto desde el punto de vista del negocio (eso es conocimiento que solo el Director Humano
tiene).

El modelo de detección hace una sola cosa: **dar al sistema la información que necesita para operar de
forma responsable en cualquier zona del repo**, ajustando automáticamente las salvaguardas al nivel de


riesgo real de esa zona.


