// Cliente ligero para la API REST de Google Cloud Speech-to-Text (speech:recognize).
// Usa la API key definida en .env como VITE_GOOGLE_CLOUD_API_KEY.

const API_URL = 'https://speech.googleapis.com/v1/speech:recognize'

// Límite de la API "sync recognize": ~1 minuto de audio / 10MB por request.
export const LIMITE_TAMANO_BYTES = 10 * 1024 * 1024

/**
 * Convierte un Blob/File a base64 puro (sin el prefijo "data:...;base64,").
 */
export function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const resultado = reader.result || ''
      const base64 = String(resultado).split(',')[1] || ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de audio.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Envía audio en base64 a Google Cloud Speech-to-Text y devuelve la transcripción.
 *
 * @param {Object} opciones
 * @param {string} opciones.base64Audio - Audio codificado en base64 (sin prefijo data URL).
 * @param {string} opciones.encoding - Codificación reconocida por Google (ej: 'WEBM_OPUS', 'MP3').
 * @param {number} [opciones.sampleRateHertz] - Frecuencia de muestreo, si aplica.
 * @param {string} opciones.languageCode - Código de idioma (ej: 'es-419').
 */
export async function transcribirAudio({ base64Audio, encoding, sampleRateHertz, languageCode }) {
  const apiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY

  if (!apiKey) {
    throw new Error(
      'Falta la API key de Google Cloud. Crea un archivo ".env" en la raíz del proyecto ' +
        'con VITE_GOOGLE_CLOUD_API_KEY=tu_api_key (mira .env.example) y reinicia "npm run dev".'
    )
  }

  const config = {
    encoding,
    languageCode,
    enableAutomaticPunctuation: true,
    model: 'default',
  }
  if (sampleRateHertz) {
    config.sampleRateHertz = sampleRateHertz
  }

  let respuesta
  try {
    respuesta = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, audio: { content: base64Audio } }),
    })
  } catch (err) {
    throw new Error('No se pudo conectar con Google Cloud. Revisa tu conexión a internet.')
  }

  const datos = await respuesta.json().catch(() => ({}))

  if (!respuesta.ok) {
    const mensaje = datos?.error?.message || `Error HTTP ${respuesta.status}`
    throw new Error(`Google Cloud Speech-to-Text: ${mensaje}`)
  }

  if (!datos.results || datos.results.length === 0) {
    return ''
  }

  return datos.results
    .map((r) => r.alternatives?.[0]?.transcript || '')
    .join(' ')
    .trim()
}
