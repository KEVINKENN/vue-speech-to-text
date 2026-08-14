<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { transcribirAudio, blobABase64, LIMITE_TAMANO_BYTES } from '../services/googleSpeech.js'

// Esta versión usa la API REST de Google Cloud Speech-to-Text de verdad.
// Requiere una API key en .env (VITE_GOOGLE_CLOUD_API_KEY). Soporta dos
// entradas de audio: grabación en vivo desde el micrófono (MediaRecorder,
// codificado como WEBM_OPUS) y subida de archivos .mp3 ya existentes.

const idiomas = [
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'es-419', label: 'Español (Latinoamérica)' },
  { code: 'en-US', label: 'Inglés (EE.UU.)' },
  { code: 'pt-BR', label: 'Portugués (Brasil)' },
]

const modo = ref('grabar') // 'grabar' | 'archivo'
const idioma = ref('es-419')
const estado = ref('inactivo') // inactivo | grabando | procesando | error
const transcripcion = ref('')
const errorMsg = ref('')
const duracionSeg = ref(0)
const nombreArchivo = ref('')
const niveles = ref(Array.from({ length: 28 }, () => 6))

let mediaRecorder = null
let chunksAudio = []
let streamActual = null
let timerId = null
let audioContext = null
let analyser = null
let animFrameId = null

const grabando = computed(() => estado.value === 'grabando')
const procesando = computed(() => estado.value === 'procesando')
const puedeGrabar = computed(() => estado.value === 'inactivo' || estado.value === 'error')
const bloqueado = computed(() => grabando.value || procesando.value)

function formatoTiempo(segundos) {
  const m = Math.floor(segundos / 60).toString().padStart(2, '0')
  const s = (segundos % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function cambiarModo(nuevoModo) {
  if (bloqueado.value) return
  modo.value = nuevoModo
  errorMsg.value = ''
}

function animarNiveles() {
  if (!analyser) return
  const datos = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(datos)

  const paso = Math.floor(datos.length / niveles.value.length) || 1
  niveles.value = niveles.value.map((_, i) => {
    const idx = i * paso
    const valor = datos[idx] || 0
    return Math.max(6, Math.round((valor / 255) * 46))
  })

  animFrameId = requestAnimationFrame(animarNiveles)
}

function detenerVisualizador() {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  animFrameId = null
  if (audioContext) {
    audioContext.close().catch(() => {})
  }
  audioContext = null
  analyser = null
  niveles.value = niveles.value.map(() => 6)
}

async function iniciarGrabacion() {
  errorMsg.value = ''
  transcripcion.value = ''

  if (!navigator.mediaDevices?.getUserMedia) {
    estado.value = 'error'
    errorMsg.value = 'Tu navegador no soporta grabación de audio.'
    return
  }

  try {
    streamActual = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    estado.value = 'error'
    errorMsg.value = 'No se pudo acceder al micrófono. Revisa los permisos del navegador.'
    return
  }

  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) =>
    MediaRecorder.isTypeSupported(t)
  )

  if (!mimeType) {
    estado.value = 'error'
    errorMsg.value = 'Tu navegador no soporta un formato de grabación compatible.'
    streamActual.getTracks().forEach((t) => t.stop())
    return
  }

  chunksAudio = []
  mediaRecorder = new MediaRecorder(streamActual, { mimeType })

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunksAudio.push(e.data)
  }

  mediaRecorder.onstop = async () => {
    detenerVisualizador()
    streamActual?.getTracks().forEach((t) => t.stop())
    clearInterval(timerId)

    if (chunksAudio.length === 0) {
      estado.value = 'inactivo'
      return
    }

    estado.value = 'procesando'
    try {
      const blob = new Blob(chunksAudio, { type: mimeType })
      const base64 = await blobABase64(blob)
      const texto = await transcribirAudio({
        base64Audio: base64,
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: idioma.value,
      })
      transcripcion.value = texto || '(No se detectó voz en la grabación)'
      estado.value = 'inactivo'
    } catch (err) {
      estado.value = 'error'
      errorMsg.value = err.message || 'Ocurrió un error al transcribir el audio.'
    }
  }

  // Visualizador de nivel de audio en tiempo real
  audioContext = new (window.AudioContext || window.webkitAudioContext)()
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 64
  const fuente = audioContext.createMediaStreamSource(streamActual)
  fuente.connect(analyser)
  animarNiveles()

  mediaRecorder.start()
  estado.value = 'grabando'
  duracionSeg.value = 0
  timerId = setInterval(() => {
    duracionSeg.value += 1
  }, 1000)
}

function detenerGrabacion() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
}

async function manejarArchivo(evento) {
  const archivo = evento.target.files?.[0]
  evento.target.value = ''
  if (!archivo) return

  errorMsg.value = ''
  transcripcion.value = ''

  const esMp3 = archivo.type === 'audio/mpeg' || /\.mp3$/i.test(archivo.name)
  if (!esMp3) {
    estado.value = 'error'
    errorMsg.value = 'Solo se admiten archivos .mp3 por ahora.'
    return
  }

  if (archivo.size > LIMITE_TAMANO_BYTES) {
    estado.value = 'error'
    errorMsg.value = 'El archivo supera los 10MB (límite de la API síncrona de Google Cloud, ~1 minuto de audio).'
    return
  }

  nombreArchivo.value = archivo.name
  estado.value = 'procesando'

  try {
    const base64 = await blobABase64(archivo)
    const texto = await transcribirAudio({
      base64Audio: base64,
      encoding: 'MP3',
      languageCode: idioma.value,
    })
    transcripcion.value = texto || '(No se detectó voz en el archivo)'
    estado.value = 'inactivo'
  } catch (err) {
    estado.value = 'error'
    errorMsg.value = err.message || 'Ocurrió un error al transcribir el archivo.'
  }
}

function copiarTexto() {
  if (transcripcion.value) {
    navigator.clipboard.writeText(transcripcion.value)
  }
}

function limpiarTexto() {
  transcripcion.value = ''
  nombreArchivo.value = ''
  errorMsg.value = ''
  if (estado.value === 'error') estado.value = 'inactivo'
}

onBeforeUnmount(() => {
  clearInterval(timerId)
  detenerVisualizador()
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  streamActual?.getTracks().forEach((t) => t.stop())
})
</script>

<template>
  <div class="card">
    <div class="glow-ring" aria-hidden="true"></div>

    <header class="encabezado">
      <p class="eyebrow">GOOGLE CLOUD · SPEECH-TO-TEXT</p>
      <h1>Voz <span class="acento">//</span> Texto</h1>
      <p class="subtitulo">Graba desde tu micrófono o sube un MP3. La transcripción corre sobre la API real de Google Cloud.</p>
    </header>

    <div class="tabs" role="tablist">
      <button
        role="tab"
        :aria-selected="modo === 'grabar'"
        class="tab"
        :class="{ activo: modo === 'grabar' }"
        :disabled="bloqueado"
        @click="cambiarModo('grabar')"
      >
        Micrófono
      </button>
      <button
        role="tab"
        :aria-selected="modo === 'archivo'"
        class="tab"
        :class="{ activo: modo === 'archivo' }"
        :disabled="bloqueado"
        @click="cambiarModo('archivo')"
      >
        Subir MP3
      </button>
    </div>

    <div class="campo">
      <label for="idioma">Idioma</label>
      <select id="idioma" v-model="idioma" :disabled="bloqueado">
        <option v-for="opt in idiomas" :key="opt.code" :value="opt.code">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- Visualizador tipo ecualizador -->
    <div class="ecualizador" :class="{ activo: grabando }" aria-hidden="true">
      <span
        v-for="(nivel, i) in niveles"
        :key="i"
        class="barra"
        :style="{ height: nivel + 'px' }"
      ></span>
    </div>

    <section v-if="modo === 'grabar'" class="panel-modo">
      <div class="controles">
        <button
          v-if="puedeGrabar"
          class="btn btn-grabar"
          @click="iniciarGrabacion"
        >
          <span class="dot"></span> Grabar
        </button>
        <button
          v-else-if="grabando"
          class="btn btn-detener"
          @click="detenerGrabacion"
        >
          ■ Detener &nbsp;<span class="mono">{{ formatoTiempo(duracionSeg) }}</span>
        </button>
        <button v-else class="btn btn-procesando" disabled>
          <span class="spinner"></span> Transcribiendo...
        </button>
      </div>
    </section>

    <section v-else class="panel-modo">
      <label class="dropzone" :class="{ deshabilitado: bloqueado }">
        <input
          type="file"
          accept=".mp3,audio/mpeg"
          :disabled="bloqueado"
          @change="manejarArchivo"
        />
        <template v-if="procesando">
          <span class="spinner"></span>
          <span>Transcribiendo «{{ nombreArchivo }}»...</span>
        </template>
        <template v-else>
          <span class="dropzone-icono">⇪</span>
          <span>Haz clic para elegir un archivo <strong>.mp3</strong></span>
          <span class="dropzone-nota">Máx. ~10MB / ~1 minuto (límite de la API síncrona)</span>
        </template>
      </label>
    </section>

    <p v-if="errorMsg" class="error">⚠️ {{ errorMsg }}</p>

    <div v-if="transcripcion" class="resultado">
      <div class="resultado-header">
        <span>Transcripción</span>
        <div class="acciones-header">
          <button class="btn-copiar" @click="copiarTexto">Copiar</button>
          <button class="btn-copiar" @click="limpiarTexto">Limpiar</button>
        </div>
      </div>
      <p>{{ transcripcion }}</p>
    </div>

    <p class="nota">
      Usa la API REST de Google Cloud Speech-to-Text con tu propia API key
      (definida en <code>.env</code>). La clave se usa directamente desde el
      navegador, ideal para desarrollo o uso personal.
    </p>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  background: linear-gradient(180deg, rgba(18, 10, 36, 0.92), rgba(10, 4, 22, 0.96));
  border: 1px solid rgba(0, 246, 255, 0.25);
  border-radius: 20px;
  padding: 36px;
  width: 100%;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(124, 58, 237, 0.15),
    0 20px 60px rgba(0, 0, 0, 0.55),
    0 0 40px rgba(0, 246, 255, 0.08);
}

.glow-ring {
  position: absolute;
  inset: -40% -40% auto auto;
  width: 260px;
  height: 260px;
  background: radial-gradient(circle, rgba(255, 43, 214, 0.35), transparent 70%);
  filter: blur(10px);
  pointer-events: none;
}

.encabezado {
  position: relative;
  margin-bottom: 24px;
  text-align: center;
}

.eyebrow {
  margin: 0 0 10px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  color: var(--neon-cyan);
  text-shadow: 0 0 8px rgba(0, 246, 255, 0.6);
}

h1 {
  margin: 0 0 10px;
  font-family: 'Orbitron', sans-serif;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #f4f0ff;
  text-shadow: 0 0 18px rgba(124, 58, 237, 0.55);
}

.acento {
  color: var(--neon-magenta);
  text-shadow: 0 0 14px rgba(255, 43, 214, 0.85);
}

.subtitulo {
  margin: 0 auto;
  max-width: 420px;
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.tabs {
  position: relative;
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(124, 58, 237, 0.25);
  border-radius: 12px;
  padding: 4px;
}

.tab {
  flex: 1;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  font-size: 0.92rem;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.tab:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.tab.activo {
  background: linear-gradient(135deg, rgba(0, 246, 255, 0.18), rgba(255, 43, 214, 0.18));
  color: #f4f0ff;
  box-shadow: 0 0 16px rgba(0, 246, 255, 0.25) inset;
}

.campo {
  position: relative;
  margin-bottom: 22px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

select {
  background: rgba(0, 0, 0, 0.4);
  color: #f4f0ff;
  border: 1px solid rgba(124, 58, 237, 0.35);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.95rem;
  font-family: 'Rajdhani', sans-serif;
}

select:focus-visible,
.tab:focus-visible,
.btn:focus-visible,
.dropzone:focus-within {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 2px;
}

/* Ecualizador */
.ecualizador {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  height: 52px;
  margin-bottom: 22px;
  padding: 0 8px;
}

.barra {
  width: 5px;
  min-height: 6px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--neon-cyan), var(--neon-magenta));
  opacity: 0.35;
  transition: height 0.08s ease, opacity 0.3s ease;
}

.ecualizador.activo .barra {
  opacity: 1;
  box-shadow: 0 0 8px rgba(0, 246, 255, 0.5);
}

.panel-modo {
  margin-bottom: 6px;
}

.controles {
  display: flex;
  justify-content: center;
  margin: 8px 0 24px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 999px;
  padding: 14px 34px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.btn:hover {
  transform: scale(1.03);
}

.btn-grabar {
  background: linear-gradient(135deg, var(--neon-magenta), #ff6b6b);
  color: #1a0410;
  box-shadow: 0 0 24px rgba(255, 43, 214, 0.55);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #1a0410;
}

.btn-detener {
  background: linear-gradient(135deg, #ffd166, #ff9f1c);
  color: #241300;
  box-shadow: 0 0 24px rgba(255, 209, 102, 0.4);
}

.mono {
  font-variant-numeric: tabular-nums;
}

.btn-procesando {
  background: rgba(124, 58, 237, 0.18);
  color: var(--text-muted);
  border: 1px solid rgba(124, 58, 237, 0.4);
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(0, 246, 255, 0.25);
  border-top-color: var(--neon-cyan);
  animation: girar 0.8s linear infinite;
}

@keyframes girar {
  to {
    transform: rotate(360deg);
  }
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  border: 1.5px dashed rgba(0, 246, 255, 0.4);
  border-radius: 14px;
  padding: 28px 16px;
  margin: 8px 0 24px;
  color: var(--text-muted);
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.95rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.dropzone:hover {
  border-color: var(--neon-cyan);
  background: rgba(0, 246, 255, 0.05);
}

.dropzone.deshabilitado {
  cursor: not-allowed;
  opacity: 0.6;
}

.dropzone input {
  display: none;
}

.dropzone-icono {
  font-size: 1.6rem;
  color: var(--neon-cyan);
  text-shadow: 0 0 10px rgba(0, 246, 255, 0.6);
}

.dropzone-nota {
  font-size: 0.75rem;
  color: #6c5f96;
}

.error {
  background: rgba(255, 43, 109, 0.1);
  border: 1px solid rgba(255, 43, 109, 0.4);
  color: #ff9db8;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 0.9rem;
}

.resultado {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(124, 58, 237, 0.25);
  border-radius: 12px;
  padding: 16px;
  margin-top: 16px;
}

.resultado-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--neon-cyan);
}

.acciones-header {
  display: flex;
  gap: 8px;
}

.btn-copiar {
  background: rgba(124, 58, 237, 0.2);
  color: #f4f0ff;
  border: 1px solid rgba(124, 58, 237, 0.4);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.8rem;
}

.btn-copiar:hover {
  border-color: var(--neon-cyan);
}

.resultado p {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  color: #f4f0ff;
}

.nota {
  margin-top: 20px;
  font-size: 0.76rem;
  line-height: 1.5;
  color: #6c5f96;
  text-align: center;
}

.nota code {
  color: var(--neon-cyan);
}
</style>
