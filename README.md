# SLENDER: THE 8 PAGES (8-BIT VR)

**Proyecto académico de Graficación — Práctica 3.7: Desarrollo de escenarios VR con Meta Quest 3S**

## Equipo

| Integrante | Número de control |
|---|---:|
| Juan Pablo Sánchez García | 24200101 |
| Eduardo Zenil Guerrero | 25200365 |

## Descripción

Experiencia de supervivencia y exploración en primera persona construida con Three.js, WebGL y WebXR. El jugador explora Pine Ridge, recupera ocho páginas, administra la linterna y la resistencia, evita a Slenderman y puede utilizar el micrófono como mecanismo opcional de detección de ruido.

La aplicación funciona en navegador de escritorio y contempla sesiones inmersivas WebXR para Meta Quest 3S.

## Características

- Escenario 3D de bosque nocturno con zonas diferenciadas.
- Cámara en primera persona y límites de navegación.
- Ocho páginas coleccionables y baterías.
- Linterna con consumo y recarga.
- Resistencia, carrera, cordura y comportamiento de Slenderman.
- Micrófono opcional con supresión de ruido y calibración; el audio del micrófono no se reproduce por las bocinas.
- Música original y efectos generados mediante Web Audio API.
- Menú cinematográfico VHS, opciones de audio y calidad gráfica.
- Pantallas de pausa, primer contacto, victoria y derrota.
- Interfaz 2D en PC y paneles de Canvas/Three.js para eventos dentro de WebXR.
- Perfil de rendimiento que reduce la resolución y la cantidad de partículas/lluvia.

## Tecnologías

- HTML5 y CSS3.
- JavaScript ES Modules.
- Three.js 0.160.0 (cargado desde unpkg mediante import map).
- WebGL y WebXR Device API.
- Web Audio API.
- GitHub Pages para alojamiento estático.

## Estructura del repositorio

```text
graf-threejs-vr-look/
├── index.html
├── README.md
├── .gitignore
├── assets/
│   ├── README.md
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js
├── docs/
│   ├── PRUEBAS-IWE-META-QUEST-3S.md
│   └── EVIDENCIAS.md
├── scripts/
│   ├── validate-project.mjs
│   └── validar-proyecto.ps1
└── .github/
    └── workflows/
        └── deploy-pages.yml
```

El escenario, las geometrías principales, las texturas pixel-art y la música/efectos se generan desde JavaScript; por ello no se distribuyen modelos ni pistas de audio pesadas en el repositorio.

## Requisitos

- Windows 10/11, macOS o Linux.
- Navegador Chromium actualizado (Chrome o Edge recomendado).
- Node.js 20 o superior para el validador estático (no es necesario para ejecutar el juego).
- Para usar el micrófono, un dispositivo de entrada y permiso del navegador.
- Para probar WebXR en hardware, navegador compatible y Meta Quest 3S.

## Ejecutar localmente en Windows PowerShell

Desde la raíz del repositorio:

```powershell
py -m http.server 5500
```

Abrir en el navegador:

```text
http://localhost:5500
```

Detener el servidor con `Ctrl + C`.

`localhost` es un origen de desarrollo local apropiado para probar APIs que requieren contexto seguro. Para la prueba física del visor y para el sitio público, se recomienda utilizar HTTPS.

## Validar el proyecto

Con Node.js instalado:

```powershell
node .\scripts\validate-project.mjs
```

O desde PowerShell:

```powershell
.\scripts\validar-proyecto.ps1
```

El validador revisa sintaxis JavaScript, estructura HTML básica, IDs duplicados, import map y rutas locales a CSS/JavaScript.

## Controles de PC

| Acción | Control |
|---|---|
| Moverse | W, A, S, D |
| Girar | Flechas izquierda/derecha |
| Correr | Shift |
| Linterna | F |
| Pausar/reanudar | Esc |
| Navegar menú de pausa | Flechas arriba/abajo |
| Confirmar | Enter |
| Volver/cerrar visor de página | Backspace |
| Recoger página | Acercarse y mirar hacia la nota |

## Controles Meta Quest 3S

| Acción | Control |
|---|---|
| Caminar/desplazarse | Joystick izquierdo |
| Girar por intervalos | Joystick derecho |
| Correr | Gatillo izquierdo mantenido |
| Interactuar/recoger | Gatillo derecho |
| Agarrar objetos cercanos | Grip izquierdo o derecho |
| Confirmar/seleccionar | A (derecho) / X (izquierdo) |
| Volver/cancelar | B (derecho) / Y (izquierdo) |
| Linterna | Pulsar joystick derecho |
| Pausar | Botón menú izquierdo |
| Menú universal | Botón Meta del visor (reservado al sistema) |

Las entradas se leen mediante eventos WebXR y Gamepad API. La asignación debe verificarse con el perfil Touch Plus emulado y, finalmente, con los mandos físicos.

## Pruebas WebXR con Immersive Web Emulator

Consultar [`docs/PRUEBAS-IWE-META-QUEST-3S.md`](docs/PRUEBAS-IWE-META-QUEST-3S.md). El emulador permite probar el runtime WebXR y entradas de gamepad en escritorio; no sustituye una prueba física de tasa de cuadros, haptics, micrófono espacial ni comodidad en Quest 3S.

## Publicación en GitHub Pages

Se incluye un flujo de GitHub Actions en `.github/workflows/deploy-pages.yml`. Para habilitarlo:

1. Integrar los cambios a la rama principal `main` mediante Pull Request.
2. En GitHub, abrir **Settings → Pages**.
3. En **Build and deployment → Source**, seleccionar **GitHub Actions**.
4. El workflow se ejecutará al recibir cambios en `main`; revisar su resultado en **Actions**.

El sitio esperado para este repositorio es `https://juanp452.github.io/graf-threejs-vr-look/`, siempre que Pages quede habilitado y el despliegue finalice correctamente. No se debe considerar publicado hasta abrir y comprobar esa URL.

## Trabajo en equipo con Git

- `main`: versión estable del equipo.
- `feature/eduardo`: cambios de Eduardo.
- Las mejoras se integran mediante Pull Request después de probarlas.
- Antes de empezar una sesión: `git switch feature/eduardo` y `git pull origin feature/eduardo`.
- Al terminar: `git add .`, `git commit -m "..."` y `git push`.
- No usar `git push --force` en la rama compartida.

## Recursos y licencias

- Three.js 0.160.0: biblioteca externa cargada desde unpkg; consultar su licencia MIT en el proyecto oficial.
- Fuente Press Start 2P: servida desde Google Fonts; consultar su licencia Open Font License en la ficha de la familia.
- Música y efectos: señales sintetizadas por la aplicación con Web Audio API; no se incluyen grabaciones comerciales.
- No se incluyen modelos, imágenes o sonidos externos descargados en esta versión.

## Limitaciones conocidas y comprobaciones pendientes

- La emulación WebXR no certifica el comportamiento físico del visor.
- Deben probarse directamente en Quest 3S la comodidad de locomoción, claridad de paneles, audio espacial, micrófono, vibración háptica y rendimiento sostenido.
- El sitio requiere conexión a Internet para cargar Three.js desde unpkg y la fuente desde Google Fonts; si falla la conexión, el fallback tipográfico se mantiene, pero la aplicación 3D no puede iniciar sin Three.js.
