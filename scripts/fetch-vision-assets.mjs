/**
 * MediaPipe 자산 준비 — public/ 아래에 wasm 런타임과 모델 파일을 놓는다.
 *
 * 합쳐서 33MB쯤 되므로 저장소에 커밋하지 않고 여기서 준비한다 (public/mediapipe,
 * public/models는 .gitignore에 있음). postinstall로 걸려 있어서 로컬에서든
 * Vercel에서든 npm install 한 번이면 갖춰진다.
 *
 * wasm은 node_modules에서 복사하므로 네트워크가 필요 없고, 모델만 받아온다.
 * 이미 있으면 건너뛰므로 여러 번 실행해도 안전하다.
 */
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const WASM_SRC = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const WASM_DEST = join(root, 'public', 'mediapipe', 'wasm')
const MODEL_DEST = join(root, 'public', 'models')

// float16 변형을 쓴다. full 정밀도 대비 절반 크기인데 방향/각도 판정에는 차이가 없다.
const MODELS = [
  {
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
]

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    throw new Error(`@mediapipe/tasks-vision의 wasm 폴더를 찾을 수 없습니다: ${WASM_SRC}`)
  }
  await mkdir(WASM_DEST, { recursive: true })
  const files = await readdir(WASM_SRC)
  for (const file of files) {
    await copyFile(join(WASM_SRC, file), join(WASM_DEST, file))
  }
  console.log(`[vision-assets] wasm ${files.length}개 복사 완료`)
}

async function fetchModels() {
  await mkdir(MODEL_DEST, { recursive: true })
  for (const model of MODELS) {
    const dest = join(MODEL_DEST, model.name)
    if (await exists(dest)) {
      console.log(`[vision-assets] ${model.name} 이미 있음 — 건너뜀`)
      continue
    }
    console.log(`[vision-assets] ${model.name} 받는 중…`)
    const res = await fetch(model.url)
    if (!res.ok || !res.body) {
      throw new Error(`${model.name} 다운로드 실패 (${res.status})`)
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
    const { size } = await stat(dest)
    console.log(`[vision-assets] ${model.name} 완료 (${Math.round(size / 1024 / 1024)}MB)`)
  }
}

await copyWasm()
await fetchModels()
