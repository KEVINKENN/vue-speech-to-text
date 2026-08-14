# Voz a Texto — Vue 3 + Google Cloud Speech-to-Text

App con estética **dark neon** que transcribe voz a texto usando la **API
REST real de Google Cloud Speech-to-Text**. Permite:

- 🎙️ Grabar audio en vivo desde el micrófono.
- 📤 Subir un archivo **.mp3** ya existente para transcribirlo.

## 1. Instalación

```bash
npm install
```

## 2. Configurar la API key de Google Cloud

1. Copia el archivo de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Consigue una API key:
   - Entra a [Google Cloud Console](https://console.cloud.google.com/).
   - Crea o selecciona un proyecto y habilita la API **"Cloud Speech-to-Text"**.
   - Ve a **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
   - (Recomendado) Restringe la clave para que solo pueda usar la Speech-to-Text API.

3. Pega tu key en `.env`:

   ```
   VITE_GOOGLE_CLOUD_API_KEY=tu_api_key_real
   ```

   El archivo `.env` ya está en `.gitignore`, así que no se sube al repo.

> ⚠️ **Importante**: esta app llama a la API directamente desde el
> navegador, por lo que la key viaja en cada request y es visible en el
> código del cliente (inspeccionando el Network tab, por ejemplo). Es una
> forma válida para desarrollo o uso personal. Para producción real, lo
> correcto es mover esta llamada a un backend propio que guarde la key en
> el servidor y no la exponga al navegador.

## 3. Ejecutar en desarrollo

```bash
npm run dev
```

Abre `http://localhost:5173`.

- **Modo Micrófono**: dale permiso al navegador para usar el micrófono,
  elige el idioma, presiona "Grabar" y habla. Al presionar "Detener", el
  audio se envía a Google Cloud y la transcripción aparece abajo.
- **Modo Subir MP3**: cambia a la pestaña "Subir MP3", elige un archivo
  `.mp3` de tu computadora y espera la transcripción.

## 4. Build para producción

```bash
npm run build
```

Genera la carpeta `dist/`. La app necesita **HTTPS** (o `localhost`) para
que el navegador permita acceso al micrófono.

## Cómo funciona

1. **Grabación**: se usa `MediaRecorder` con codificación `audio/webm;codecs=opus`
   (o el mejor formato soportado por el navegador). Al detener la grabación,
   el audio se convierte a base64 y se envía como `WEBM_OPUS` a la API.
2. **Archivo MP3**: el archivo se lee y se convierte a base64 directamente,
   y se envía como `MP3` a la API.
3. En ambos casos se llama a `https://speech.googleapis.com/v1/speech:recognize`
   con la API key como parámetro de query, junto con el idioma elegido.
4. La respuesta trae el texto reconocido en `results[].alternatives[0].transcript`.

## Límites de la API síncrona

El endpoint `speech:recognize` (síncrono, el que usa esta app) admite hasta
**~1 minuto de audio** y **10MB por request**. Para audios más largos,
Google Cloud requiere el modo asíncrono (`longrunningrecognize`) con el
audio alojado en Google Cloud Storage, lo cual necesita un backend.

## Limitaciones conocidas

- Solo se admiten archivos `.mp3` para subida (no `.wav`, `.m4a`, etc. — se
  puede ampliar agregando el `encoding` correspondiente en
  `src/services/googleSpeech.js`).
- El uso de la API tiene costo según el
  [pricing de Google Cloud](https://cloud.google.com/speech-to-text/pricing)
  una vez agotada la capa gratuita.
