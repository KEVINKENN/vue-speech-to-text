<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'

// Esta versión usa la Web Speech API nativa del navegador (SpeechRecognition).
// No requiere API key, .env, ni facturación de Google Cloud. Internamente,
// en Chrome/Edge, usa los servidores de reconocimiento de voz de Google,
// pero de forma gratuita y sin necesidad de configurar un proyecto en la nube.
// Limitación: solo funciona en navegadores basados en Chromium (Chrome, Edge, Opera).

const idiomas = [
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'es-419', label: 'Español (Latinoamérica)' },
  { code: 'en-US', label: 'Inglés (EE.UU.)' },
  { code: 'pt-BR', label: 'Portugués (Brasil)' },
]

const idioma = ref('es-419')
const estado = ref('inactivo') // inactivo | grabando | error
const transcripcion = ref('')
const parcial = ref('')
const errorMsg = ref('')
const duracionSeg = ref(0)

let recognition = null
let timerId = null

const puedeGrabar = computed(() => estado.value === 'inactivo' || estado.value === 'error')
const grabando = computed(() => estado.value === 'grabando')

const SpeechRecognitionAPI =
  window.SpeechRecognition || window.webkitSpeechRecognition || null

function formatoTiempo(segundos) {
  const m = Math.floor(segundos / 60).toString().padStart(2, '0')
  const s = (segundos % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function iniciarGrabacion() {
  errorMsg.value = ''
  parcial.value = ''

  if (!SpeechRecognitionAPI) {
    estado.value = 'error'
    errorMsg.value =
      'Tu navegador no soporta reconocimiento de voz. Usa Google Chrome o Microsoft Edge.'
    return
  }

  recognition = new SpeechRecognitionAPI()
  recognition.lang = idioma.value
  recognition.continuous = true
  recognition.interimResults = true

  recognition.onresult = (event) => {
    let textoFinal = ''
    let textoParcial = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const resultado = event.results[i]
      if (resultado.isFinal) {
        textoFinal += resultado[0].transcript + ' '
      } else {
        textoParcial += resultado[0].transcript
      }
    }

    if (textoFinal) {
      transcripcion.value = (transcripcion.value + ' ' + textoFinal).trim()
    }
    parcial.value = textoParcial
  }

  recognition.onerror = (event) => {
    estado.value = 'error'
    if (event.error === 'not-allowed' || event.error === 'permission-denied') {
      errorMsg.value = 'No se pudo acceder al micrófono. Revisa los permisos del navegador.'
    } else if (event.error === 'no-speech') {
      errorMsg.value = 'No se detectó voz. Intenta hablar más cerca del micrófono.'
    } else {
      errorMsg.value = `Error de reconocimiento: ${event.error}`
    }
  }

  recognition.onend = () => {
    clearInterval(timerId)
    parcial.value = ''
    if (estado.value === 'grabando') {
      estado.value = 'inactivo'
    }
  }

  recognition.start()
  estado.value = 'grabando'
  duracionSeg.value = 0
  timerId = setInterval(() => {
    duracionSeg.value += 1
  }, 1000)
}

function detenerGrabacion() {
  if (recognition) {
    recognition.stop()
  }
}

function copiarTexto() {
  if (transcripcion.value) {
    navigator.clipboard.writeText(transcripcion.value)
  }
}

function limpiarTexto() {
  transcripcion.value = ''
  parcial.value = ''
}

onBeforeUnmount(() => {
  clearInterval(timerId)
  if (recognition) recognition.stop()
})
</script>

<template>
  <div class="card">
    <h1>🎙️ Voz a texto</h1>
    <p class="subtitulo">Transcripción con Google Cloud Speech-to-Text</p>

    <div class="campo">
      <label for="idioma">Idioma</label>
      <select id="idioma" v-model="idioma" :disabled="grabando || procesando">
        <option v-for="opt in idiomas" :key="opt.code" :value="opt.code">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="controles">
      <button
        v-if="puedeGrabar"
        class="btn btn-grabar"
        @click="iniciarGrabacion"
      >
        ● Grabar
      </button>
      <button
        v-else-if="grabando"
        class="btn btn-detener"
        @click="detenerGrabacion"
      >
        ■ Detener ({{ formatoTiempo(duracionSeg) }})
      </button>
      <button v-else class="btn btn-procesando" disabled>
        Transcribiendo...
      </button>
    </div>

    <p v-if="errorMsg" class="error">⚠️ {{ errorMsg }}</p>

    <div v-if="transcripcion || parcial" class="resultado">
      <div class="resultado-header">
        <span>Transcripción</span>
        <div class="acciones-header">
          <button class="btn-copiar" @click="copiarTexto">Copiar</button>
          <button class="btn-copiar" @click="limpiarTexto">Limpiar</button>
        </div>
      </div>
      <p>
        {{ transcripcion }}
        <span class="parcial">{{ parcial }}</span>
      </p>
    </div>

    <p class="nota">
      Nota: esta app usa el reconocimiento de voz nativo del navegador
      (gratuito). Funciona en Chrome y Edge; no está soportado en Firefox ni Safari.
    </p>
  </div>
</template>

<style scoped>
.card {
  background: #1e293b;
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

h1 {
  margin: 0 0 4px;
  font-size: 1.6rem;
}

.subtitulo {
  margin: 0 0 24px;
  color: #94a3b8;
  font-size: 0.95rem;
}

.campo {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  font-size: 0.85rem;
  color: #94a3b8;
}

select {
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.95rem;
}

.controles {
  display: flex;
  justify-content: center;
  margin: 24px 0;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 14px 32px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.btn:hover {
  transform: scale(1.03);
}

.btn-grabar {
  background: #ef4444;
  color: white;
}

.btn-detener {
  background: #f59e0b;
  color: #1e293b;
}

.btn-procesando {
  background: #334155;
  color: #94a3b8;
  cursor: not-allowed;
}

.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.resultado {
  background: #0f172a;
  border-radius: 10px;
  padding: 16px;
  margin-top: 16px;
}

.resultado-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.85rem;
  color: #94a3b8;
}

.acciones-header {
  display: flex;
  gap: 8px;
}

.btn-copiar {
  background: #334155;
  color: #e2e8f0;
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.8rem;
}

.resultado p {
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
}

.parcial {
  color: #64748b;
  font-style: italic;
}

.nota {
  margin-top: 20px;
  font-size: 0.78rem;
  color: #64748b;
  text-align: center;
}
</style>
