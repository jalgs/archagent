# ArchAgent en Repos Legacy
### Cómo el sistema se adapta cuando no hay arquitectura limpia que leer

---

## 1. El Problema Específico del Legacy

Un repo legacy no es simplemente un repo con deuda. Es un repo donde **la arquitectura real y la
arquitectura aparente divergen**. Hay capas implícitas que nadie documentó, reglas de negocio escondidas
en condiciones que parecen técnicas, patrones que se comenzaron pero nunca se terminaron, y decisiones
de hace diez años que todo el mundo "sabe" pero nadie puede explicar.

El sistema original asume que `archbase/` puede construirse a partir de lo que hay. En un repo legacy eso es
optimista. Lo que hay puede ser:

- **Arquitectura sedimentaria:** capas de refactors incompletos apilados uno sobre otro. Hay código con tres
estilos distintos en el mismo fichero porque cada reescritura parcial llegó hasta la mitad.
- **Acoplamiento estructural implícito:** módulos que no dependen el uno del otro en el código pero que
comparten estado global, base de datos sin restricciones, o convenciones de naming que crean dependencia
conceptual invisible.
- **Lógica de negocio fugitiva:** reglas de negocio críticas viviendo en helpers, en middlewares, en queries
SQL, en validaciones de formulario. No hay dominio porque nadie lo extrajo nunca.
- **Tests que no prueban nada útil:** cobertura alta sobre getters y setters, cero tests sobre comportamiento
real. Los tests no ayudan a entender el sistema — mienten sobre él.
- **Documentación que contradice el código:** el README describe la arquitectura objetivo de un refactor
que nunca terminó.

Ante esto, el sistema necesita un modo de operación diferente.

---

## 2. Nuevo Agente: El Archaeologist

El Scout del sistema base es un explorador. Para legacy necesitamos un **Archaeologist**: un agente que no
documenta lo que hay, sino que **reconstruye la intención original, identifica las capas históricas, y produce
un diagnóstico honesto de la distancia entre lo que el código es y lo que necesita ser**.

### Lo que hace diferente al Archaeologist


El Scout produce `ARCH.md` — una descripción de la arquitectura actual. El Archaeologist produce tres
cosas:

**`ARCHAEOLOGY.md` — Lo que el código *es* realmente**
No lo que parece, no lo que el README dice. Un mapa forense. Incluye:

- Las capas reales de acoplamiento (no las capas nominales de los directorios)
- Los "load-bearing walls": código que nadie toca porque si se mueve algo cae, aunque nadie sepa
exactamente qué
- Los anti-patrones dominantes y su distribución en el repo
- Los "dialectos": partes del código escritas en estilos tan distintos que parecen proyectos diferentes
- Las reglas de negocio fugitivas y dónde viven

**`INTENT.md` — Lo que el código *quiso ser***
Inferido a partir de naming, estructura de directorios, commits antiguos, tests que sobrevivieron, comentarios
históricos. Es especulativo, y debe marcarse como tal, con nivel de confianza. El Director Humano valida y
corrige esta inferencia — ese proceso de validación es en sí mismo valioso porque fuerza a articular la
intención del sistema.

**`DELTA.md` — La distancia entre ambos**
El gap entre `ARCHAEOLOGY.md` y una arquitectura objetivo (que puede ser Clean Architecture, Hexagonal, o
cualquier otra que el Director elija). No es una lista de problemas — es un mapa de transformación: qué
habría que mover, extraer, eliminar, o añadir para llegar desde aquí hasta ahí.

## ---

## 3. El Concepto de Strangler Fig en el Sistema

El patrón más probado para transformar legacy es el **Strangler Fig**: no reescribir, sino crecer la
arquitectura nueva *alrededor* del código viejo, redirigiendo el comportamiento progresivamente hasta que
el código viejo queda estrangulado y puede eliminarse.

El sistema debe entender este patrón a nivel operativo, porque cambia cómo todos los agentes trabajan:

- El Design Agent, cuando trabaja sobre legacy, no diseña para el código ideal — diseña para **el siguiente
paso tolerable hacia el código ideal**, respetando que el código viejo tiene que seguir funcionando
- El Implementation Agent opera siempre en modo "no romper nada existente", con tests de caracterización
antes de tocar cualquier línea
- El Review Agent añade una dimensión extra: ¿este cambio acerca o aleja el código de la arquitectura
objetivo definida en `DELTA.md`?

---


## 4. Nuevo Concepto: Characterization Tests como Prerequisito

En un repo legacy, **no puedes refactorizar lo que no puedes describir**. Los characterization tests (término
de Michael Feathers) son tests que no verifican que el código hace lo correcto — verifican que el código hace
lo que hace. Son una red de seguridad que te permite mover código sin saber si su comportamiento es el
correcto, pero sabiendo que no lo has cambiado.

El sistema necesita un flujo previo a cualquier intervención en código legacy:

```
Director: "Quiero refactorizar el módulo de facturación"
│
▼
Archaeologist (foco en módulo de facturación)
│
▼
Characterization Test Agent  ← NUEVO
├─► Lee ARCHAEOLOGY.md del módulo
├─► Identifica todos los puntos de entrada/salida observables
├─► Genera tests que capturan el comportamiento actual (sin juzgarlo)
└─► Produce cobertura suficiente para que el Implementation Agent pueda moverse
│
[CHECKPOINT HUMANO] → Director revisa que la cobertura es suficiente
│
▼
Solo entonces: Design → Implementation → Review
```

Este agente es explícitamente "neutral" — no le importa si el comportamiento que está capturando es
correcto o incorrecto. Solo le importa que quede registrado. La corrección del comportamiento es una
conversación separada, que requiere conocimiento del negocio que solo el Director Humano puede aportar.

## ---

## 5. Nuevo Flujo: La Sesión de Triage

Antes de cualquier intervención en un repo legacy, el sistema debe hacer un **triage**: clasificar la deuda por
tipo, impacto, y riesgo de intervención. Esto produce la materia prima para que el Director Humano tome
decisiones estratégicas, no solo tácticas.


## ```

archbase/TRIAGE.md
├── CRITICAL: Deuda que bloquea features o causa bugs en producción
├── STRUCTURAL: Violaciones arquitectónicas que generan deuda exponencial
├── HYGIENE: Deuda de código que reduce velocidad pero no genera riesgo
└── COSMETIC: Naming, formateo, comentarios — impacto mínimo
```

El Archaeologist produce el TRIAGE. El Director Humano decide qué se ataca, en qué orden, y con qué nivel
de agresividad. Sin ese paso, los agentes trabajarán sobre lo que es más visible, que raramente es lo más
importante.

El triage también clasifica la deuda por **riesgo de intervención**:

- **Alta visibilidad / bajo riesgo:** código muy usado pero bien cubierto por tests, con comportamiento claro.
Candidato ideal para empezar.
- **Alta visibilidad / alto riesgo:** código muy usado, mal cubierto, comportamiento incierto. Requiere
Characterization Test Agent antes de tocar.
- **Baja visibilidad / bajo riesgo:** código poco usado, bien aislado. Puede atacarse como ejercicio de
calentamiento.
- **Baja visibilidad / alto riesgo:** código aparentemente irrelevante pero con efectos laterales ocultos. **No
tocar sin investigación profunda.** Estos son los load-bearing walls.

## ---

## 6. Adaptaciones de los Agentes Existentes

### Scout → Archaeologist mode

Cuando el Scout detecta (por umbral de métricas: complejidad ciclomática, ratio tests/código, profundidad
de herencia, acoplamiento aferente/eferente) que está ante un repo legacy, activa el modo Archaeologist
automáticamente. No produce `ARCH.md` limpio — produce `ARCHAEOLOGY.md` + `INTENT.md` +
`DELTA.md`.

### Design Agent → Incremental Design mode

En modo legacy, el Design Agent recibe una restricción adicional en su skill: **cada DDR debe ser un paso
Baby Step que preserva la funcionalidad existente**. El DDR incluye una sección obligatoria: "Qué debe seguir
funcionando exactamente igual tras este cambio". El Design Agent que ignora esta sección produce un DDR
que el Review Agent rechaza automáticamente.


Además, el Design Agent consulta `DELTA.md` para asegurarse de que el cambio propuesto va en la
dirección correcta de la arquitectura objetivo. Un cambio que mejora localmente pero aleja del objetivo
arquitectónico se marca como "local improvement, architectural regression" y requiere decisión consciente
del Director.

### Implementation Agent → Characterization-first mode

Antes de modificar cualquier fichero en modo legacy, el Implementation Agent:

1. Comprueba si ese fichero tiene cobertura suficiente en `archbase/COVERAGE.md`
2. Si no, para y solicita al Orchestrator que active el Characterization Test Agent
3. Solo procede cuando tiene la cobertura necesaria

Esto no es opcional ni override-able sin aprobación explícita del Director Humano. Es la diferencia entre
refactorizar con red y sin ella.

### Review Agent → Regression + Direction check

En modo legacy, el Review Agent añade dos dimensiones:

- **Regression check:** ¿algún test de caracterización existente falla? Si sí, blocking issue automático.
- **Direction check:** ¿el cambio acerca o aleja de la arquitectura objetivo en `DELTA.md`? Si aleja, advisory
issue con justificación requerida.

## ---

## 7. El Concepto de "Seam" como Unidad de Trabajo

Michael Feathers introdujo el concepto de **seam**: un lugar donde puedes alterar el comportamiento del
programa sin editar el código en ese lugar (típicamente mediante inyección de dependencias, polimorfismo,
o preprocesador). Los seams son los puntos de entrada para el refactor legacy.

El Archaeologist debe identificar explícitamente los seams disponibles en el código como parte de
`ARCHAEOLOGY.md`. Esto sirve de dos formas:

- El Design Agent sabe dónde puede insertar abstracción sin cirugía mayor
- El Implementation Agent sabe por dónde puede entrar sin romper lo que rodea al código que toca

En repos donde no hay seams (código muy acoplado, sin inyección, con estado global), el primer trabajo del
Design Agent no es añadir features — es **crear seams**. Eso es también un DDR: "DDR-001: Introducir seam
en módulo de autenticación para permitir sustitución del proveedor de usuarios."

---


## 8. Flujos Específicos para Legacy

### Flujo L1: Onboarding a un repo legacy desconocido
```
Director: "Este es el repo. No sé bien cómo está. Necesito entenderlo antes de tocarlo."
│
Archaeologist (análisis completo)
├─► ARCHAEOLOGY.md
├─► INTENT.md (con nivel de confianza por sección)
└─► TRIAGE.md
│
[CHECKPOINT HUMANO] → Director valida INTENT.md
│  (Este es el paso más valioso: fuerza a articular qué debería ser el sistema)
│
Design Agent (modo estratégico)
├─► Lee TRIAGE.md
├─► Propone arquitectura objetivo (ARCH_TARGET.md)
└─► Produce DELTA.md: el mapa de transformación
│
[CHECKPOINT HUMANO] → Director aprueba arquitectura objetivo
│
Sistema listo para operar en modo legacy
```

### Flujo L2: Añadir una feature a código legacy sin empeorar nada
```
Director: "Necesitamos añadir X, pero el módulo afectado es un desastre"
│
Archaeologist (foco en módulo)
│
Characterization Test Agent (cobertura del módulo)
│
[CHECKPOINT HUMANO] → Director confirma cobertura suficiente
│
Design Agent (incremental mode)
├─► Diseña la feature minimizando el footprint en código legacy
├─► Identifica seams disponibles
└─► DDR con sección "qué no cambia"
│
Implementation Agent (characterization-first)


## │

Review Agent (regression + direction check)
```

### Flujo L3: Refactor estratégico de un módulo crítico
```
Director: "El módulo de pagos es un load-bearing wall. Necesitamos modernizarlo."
│
Archaeologist (análisis forense profundo del módulo)
│
Characterization Test Agent (cobertura exhaustiva — más agresiva que en L2)
│
Design Agent (Strangler Fig)
├─► Diseña la interfaz del módulo nuevo (el "fig tree" que crece alrededor)
├─► Plan de migración por fases (cada fase es un DDR separado)
└─► Define el criterio de "viejo código estrangulado y eliminable"
│
[CHECKPOINT HUMANO] → Director aprueba plan completo antes de empezar
│
Por cada fase:
Implementation Agent → Review Agent → [checkpoint] → siguiente fase
│
Al final: eliminación del código viejo (también un DDR)
```

### Flujo L4: Emergency fix en código legacy sin entender el contexto
```
Director: "Hay un bug en producción. Está en código que nadie entiende bien."
│
Archaeologist (modo urgente — foco quirúrgico en el área del bug)
├─► ¿Hay tests de caracterización para este código?
│   SI → continuar
│   NO → Characterization Test Agent mínimo antes de tocar
│
Design Agent (scope mínimo)
├─► Fix lo más local posible
├─► DDR marcado como "emergency — technical debt registrado"
└─► Registra en DEBT.md la deuda contraída conscientemente
│
Implementation Agent
│


Review Agent (regression check prioritario)
│
[POST-MORTEM] → Archaeologist añade el área al backlog de refactor
```

---

## 9. Métricas de Evolución del Legacy

El sistema debe hacer visible el progreso de la transformación. En `archbase/METRICS.md`:

- **Architecture alignment score:** porcentaje de módulos que respetan la Dependency Rule hacia
`ARCH_TARGET.md`
- **Seam coverage:** porcentaje de módulos con seams identificados y utilizables
- **Characterization coverage:** porcentaje de código legacy cubierto por tests de caracterización
- **DELTA progress:** qué porcentaje del gap documentado en `DELTA.md` ha sido cerrado
- **Debt velocity:** ¿se está generando más deuda de la que se elimina?

Estas métricas no son para obsesionarse con ellas — son para que el Director Humano pueda tomar
decisiones estratégicas informadas. Si la debt velocity es negativa (se genera más de lo que se elimina), la
respuesta no es trabajar más rápido sino revisar si el sistema está bien configurado para el contexto actual.

## ---

## 10. La Mentalidad Correcta para Operar en Legacy

El sistema puede fallar en repos legacy no por limitaciones técnicas sino por mentalidad equivocada. Hay
tres errores comunes que el sistema debe estar diseñado para prevenir:

**El error del perfeccionismo:** querer arreglar todo antes de añadir nada nuevo. El resultado es parálisis. El
sistema lo previene obligando a que cada DDR sea un Baby Step y que el Director apruebe explícitamente el
alcance antes de empezar.

**El error del optimismo:** asumir que el código legacy es más simple de lo que es, o que la cobertura de
tests es suficiente cuando no lo es. El sistema lo previene con el Characterization Test Agent como
prerequisito no negociable.

**El error del heroísmo:** querer hacer una gran reescritura que arregle todo de una vez. El Strangler Fig
existe precisamente porque las grandes reescrituras casi nunca terminan bien. El sistema lo previene con el
flujo L3: el plan completo requiere aprobación del Director antes de empezar la primera fase, y cada fase
requiere revisión antes de la siguiente.


El legacy no se cura con velocidad. Se cura con **dirección constante y pasos pequeños seguros**. Eso es
exactamente lo que este sistema intenta automatizar a nivel de andamiaje, dejando al Director Humano el
único trabajo que realmente requiere juicio: decidir adónde va el sistema y a qué ritmo.


