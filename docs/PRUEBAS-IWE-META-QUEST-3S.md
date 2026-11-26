# Prueba WebXR con Immersive Web Emulator (IWE) y Meta Quest 3S

## Qué permite comprobar

Immersive Web Emulator permite emular un runtime WebXR desde Chrome/Edge de escritorio y controlar un visor/cascos y mandos simulados. La extensión actual funciona con activación explícita por sitio: instalarla no basta; debe habilitarse para la página abierta.

La emulación ayuda a verificar la creación de la sesión `immersive-vr`, el render estéreo y los eventos/valores de Gamepad. **No equivale a una prueba física con Meta Quest 3S** y no certifica rendimiento sostenido, temperatura, comodidad, calidad de audio espacial, micrófono real ni vibración háptica física.

## Preparar el entorno

1. Utiliza Chrome o Edge basado en Chromium.
2. Confirma que Immersive Web Emulator está habilitada en `chrome://extensions` (Chrome) o `edge://extensions` (Edge).
3. Ancla/pinea el icono de Immersive Web Emulator a la barra del navegador.
4. Inicia el servidor del juego desde la raíz del repositorio:

   ```powershell
   py -m http.server 5500
   ```

5. Abre `http://localhost:5500`.
6. Pulsa el icono de Immersive Web Emulator en la barra de extensiones para habilitar la emulación en ese sitio. En IWE 2.x la página se recarga con el runtime emulado.
7. Omite la introducción si aparece y espera al menú principal.
8. En DevTools (`F12`), abre la pestaña **WebXR** cuando esté disponible para revisar el dispositivo y los ajustes persistentes del emulador.

> Si el perfil exacto Meta Quest 3S no aparece en el selector de dispositivo, selecciona el perfil Meta Quest compatible disponible (por ejemplo, Quest 3) solo como aproximación de WebXR/Touch Plus. Registra esa diferencia en la evidencia; no declares que equivale a una prueba física de Quest 3S.

## Prueba de entrada a VR

1. Confirma que aparece el botón de Three.js para entrar a VR.
2. Inicia `INICIAR LA GRABACIÓN` si quieres comenzar en PC; para probar WebXR, usa el botón `ENTER VR`/`ENTER XR` de Three.js que aparece en el menú.
3. Activa la sesión inmersiva desde el botón.
4. Confirma que el entorno se renderiza en estéreo en la vista emulada.
5. Mueve/rota el visor simulado desde el overlay de IWE y comprueba que la cámara sigue esos cambios.

## Matriz de controles

| Entrada simulada | Acción esperada en el juego |
|---|---|
| Stick izquierdo | Desplazamiento |
| Stick derecho | Giro por intervalos |
| Trigger izquierdo / `selectstart` | Correr mientras se mantiene presionado |
| Trigger derecho / `selectstart` | Solicitar interacción con objeto cercano |
| Grip / `squeezestart` | Agarre de objeto cercano |
| A (derecho) / X (izquierdo) | Confirmar/seleccionar; en pantalla final, reintentar |
| B (derecho) / Y (izquierdo) | Volver/cancelar; en pantalla final, regresar al menú y salir de sesión según flujo del juego |
| Menú izquierdo | Abrir/cerrar pausa |
| Click del stick derecho | Encender/apagar linterna |

Los botones se procesan por transiciones de estado para evitar que una pulsación sostenida repita la acción cada frame.

## Pruebas funcionales sugeridas

- Mover el visor y comprobar seguimiento de cabeza.
- Mover cada stick y observar desplazamiento/giro.
- Pulsar el trigger izquierdo para correr y soltarlo para detener el sprint.
- Acercar el mando a una pila/página y usar trigger derecho o Grip.
- Confirmar una acción con A/X.
- Abrir pausa con Menú izquierdo; navegar opciones con stick izquierdo y confirmar con A/X.
- Cerrar/volver con B/Y.
- Pulsar el stick derecho y comprobar la linterna.
- Recoger una página y revisar el panel 3D de confirmación.
- Forzar una derrota o victoria y revisar el expediente final 3D.
- Salir de la sesión y comprobar que regresa al menú del navegador.

## Limitaciones conocidas de IWE

La ficha actual de IWE 2.0 indica soporte para WebXR Device API y Gamepads, entre otras extensiones, pero no declara soporte para WebXR DOM Overlays ni Lighting Estimation. El juego dibuja sus paneles VR (pausa, página, primer contacto y resultados) como texturas Canvas sobre planos 3D, por lo que no depende de DOM Overlays para esos paneles.

## Prueba física final en Meta Quest 3S

Antes de entregar, repetir como mínimo:

- Entrada y salida de sesión en Meta Quest Browser desde la URL HTTPS publicada.
- Seguimiento de cabeza y ambos mandos.
- Gatillos, grips, botones A/X, B/Y, Menú izquierdo y stick click derecho.
- Recolección de páginas y pilas.
- Paneles VR legibles a distancia de uso.
- Micrófono real con permiso concedido y desactivado.
- Audio espacial, música, mezcla y volumen seguro.
- Respuesta háptica real.
- Comodidad de movimiento y estabilidad de cuadros durante varios minutos.

Registra navegador, fecha, perfil emulado/físico, pruebas realizadas, resultado y observaciones. No afirmes que se realizó una prueba física si únicamente se utilizó IWE.
