# Voz a Texto — Vue 3 + Web Speech API

App funcional que transcribe voz a texto en tiempo real usando el
reconocimiento de voz **nativo del navegador** (Web Speech API).

No requiere API key de Google Cloud, ni archivo `.env`, ni facturación.
Todo funciona desde el propio navegador.

## Requisitos

- **Google Chrome** o **Microsoft Edge** (la Web Speech API no está soportada
  en Firefox ni Safari).
- Conexión a internet (el navegador envía el audio a un servicio de
  reconocimiento de voz de Google por debajo, de forma transparente y gratuita).

## 1. Instalación

```bash
npm install
```

## 2. Ejecutar en desarrollo

```bash
npm run dev
```

Abre `http://localhost:5173`, dale permiso al navegador para usar el
micrófono, elige el idioma, presiona "Grabar" y empieza a hablar. El texto
va apareciendo mientras hablas (en gris el texto provisional, en blanco el
texto ya confirmado).

## 3. Build para producción

```bash
npm run build
```

Esto genera la carpeta `dist/` lista para desplegar (Netlify, Vercel,
Firebase Hosting, GitHub Pages, etc.). La app necesita **HTTPS** (o
`localhost`) para que el navegador permita acceso al micrófono.

## Cómo funciona

1. Se crea una instancia de `SpeechRecognition` (o `webkitSpeechRecognition`
   en Chrome/Edge).
2. Se configura el idioma elegido y `continuous: true` para que siga
   escuchando sin detenerse tras cada frase.
3. Cada vez que el navegador reconoce texto, se dispara el evento
   `onresult`, que separa el texto "final" (confirmado) del "parcial"
   (todavía en proceso).
4. Al presionar "Detener", se llama a `recognition.stop()`.

## Limitaciones

- Solo funciona en navegadores basados en Chromium (Chrome, Edge, Opera,
  Brave). En Firefox y Safari no hay soporte de esta API.
- La calidad y el idioma detectado dependen del motor de voz del navegador,
  no es configurable a bajo nivel como en la API REST de Google Cloud.
- Si en el futuro necesitas transcribir archivos de audio ya grabados (no en
  vivo desde el micrófono), esta API no sirve — para eso sí se necesitaría la
  API REST de Google Cloud Speech-to-Text con facturación habilitada.
