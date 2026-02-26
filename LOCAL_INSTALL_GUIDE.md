# Instalación local de ArchAgent (guía completa)

Esta guía corrige exactamente el problema que viste en terminal.

## TL;DR

Desde la raíz del repo (`/home/jal/ai-tools/archagent`):

```bash
npm run pi:install
```

Y para reinstalar:

```bash
npm run pi:reinstall
```

---

## Qué estaba fallando

En tu salida hay dos problemas:

1. **Typo de comando**
   - `pin install ...` ❌
   - `pi install ...` ✅

2. **Uso incorrecto de `local:`**
   - En la versión actual de Pi, para rutas locales se pasa la ruta directa, **sin** prefijo `local:`.
   - Correcto:
     - `pi install .`
     - `pi install /ruta/absoluta/al/paquete`
     - `pi install ../archagent`
   - Incorrecto:
     - `pi install local:archagent`
     - `pi install local:.`

Pi está interpretando literalmente `local:...` como parte del path, por eso buscaba rutas tipo:
`/home/jal/ai-tools/archagent/local:archagent`.

---

## Instalación local paso a paso

### 1) Ir al repo

```bash
cd /home/jal/ai-tools/archagent
```

### 2) Instalar dependencias (si no lo hiciste)

```bash
npm install
```

### 3) Instalar el paquete en Pi (global)

```bash
npm run pi:install
```

Este script hace:
1. Build TypeScript (`npm run build`)
2. `pi install .`

### 4) Verificar que quedó instalado

```bash
pi list
```

Debes ver una entrada del paquete apuntando a este repo local.

### 5) Probar en un repo objetivo

En el repo donde quieras usarlo:

```text
/arch:init
/arch:status
```

Si esos comandos existen, la extensión cargó bien.

---

## Reinstalación rápida (cuando cambias código)

```bash
cd /home/jal/ai-tools/archagent
npm run pi:reinstall
```

Este script hace:
1. Build
2. remove (si existe)
3. install

---

## Instalación en scope de proyecto (`-l`)

Si quieres que se registre en `.pi/settings.json` del proyecto actual:

```bash
npm run pi:install:project
```

Reinstalar en project scope:

```bash
npm run pi:reinstall:project
```

---

## Scripts añadidos en `package.json`

- `pi:install`
- `pi:install:project`
- `pi:remove`
- `pi:remove:project`
- `pi:reinstall`
- `pi:reinstall:project`

---

## Troubleshooting

### A) `Error: Path does not exist: ... local:...`
Estás usando prefijo `local:`. Quita eso y usa ruta normal:

```bash
pi install .
```

### B) `command not found: pi`
Pi no está en PATH. Verifica instalación de Pi y/o abre una shell nueva.

### C) Se instala pero no aparecen comandos `/arch:*`
1. Confirma con `pi list` que apunta a este repo.
2. Reinicia sesión de Pi.
3. Revisa que `package.json` tenga:
   - `keywords: ["pi-package"]`
   - `pi.extensions`
   - `pi.skills`

### D) Tras cambios no se refleja nada
Haz reinstall:

```bash
npm run pi:reinstall
```

---

## Comandos manuales equivalentes (sin scripts)

```bash
# instalar global
npm run build
pi install .

# reinstalar global
npm run build
pi remove "$PWD" || true
pi install .
```
