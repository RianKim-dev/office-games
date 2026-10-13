/**
 * 웹캠에서 "고개가 얼마나 돌아갔나"와 "손이 어느 쪽에 있나"를 뽑아내는 모듈.
 *
 * UI도 게임 규칙도 모른다. 여기서 나온 원시 측정값(VisionSample)을 chamRules가
 * 방향과 등급으로 해석한다. 이렇게 나눠야 규칙을 튜닝할 때 웹캠 없이 테스트할 수 있다.
 *
 * 좌표계 약속: 이 모듈이 내보내는 부호는 전부 **사용자 기준**이다.
 * yawDeg > 0 이면 사용자가 자기 왼쪽을 본 것이고, handOffset > 0 이면 손이
 * 사용자의 왼쪽에 있다. 화면을 거울로 뒤집어 보여주든 말든 여기 값은 안 바뀐다.
 */
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { WRIST, faceCenterX, noseRatioFrom, yawFromMatrix } from './visionMath'

export { yawFromMatrix } from './visionMath'

const WASM_PATH = '/mediapipe/wasm'
const FACE_MODEL = '/models/face_landmarker.task'
const HAND_MODEL = '/models/hand_landmarker.task'

/**
 * 원본(거울 처리 안 된) 카메라 이미지에서 사용자의 왼쪽이 x가 큰 쪽인지.
 *
 * 카메라가 사람을 마주 보므로 이론상 참이지만, 드라이버나 브라우저가 미리 좌우를
 * 뒤집어 내보내는 경우가 있다. 캘리브레이션 화면에서 실측해 확정한다.
 * (ChamCalibrate에서 이 값을 뒤집어야 하는지 눈으로 확인할 수 있다)
 */
export const USER_LEFT_IS_POSITIVE_X = true

/**
 * 카메라를 연다. getUserMedia가 던지는 DOMException은 이름만 봐서는 뭘 해야 할지
 * 알 수 없어서, 실제로 취할 수 있는 행동으로 번역해 던진다.
 *
 * 이 게임은 카메라가 없으면 아무것도 안 되므로 여기서 막히면 사용자가 스스로
 * 풀 수 있어야 한다. 캘리브레이션 화면과 랩 페이지가 같이 쓴다.
 */
export async function requestCamera(): Promise<MediaStream> {
  // http로 LAN IP에 접속하면 mediaDevices 자체가 없다. PC 2대로 테스트할 때 걸린다
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      '보안 연결이 아니라 카메라를 쓸 수 없어요. localhost나 https 주소로 접속해 주세요.',
    )
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' },
      audio: false,
    })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    switch (name) {
      case 'NotAllowedError':
        throw new Error(
          '카메라 권한이 거부됐어요. 주소창 왼쪽 자물쇠 아이콘에서 카메라를 허용해 주세요. ' +
            '(IDE나 앱 안에 내장된 미리보기 창은 아예 프롬프트가 안 뜹니다 — 크롬/엣지에서 직접 열어주세요)',
        )
      case 'NotFoundError':
      case 'OverconstrainedError':
        throw new Error('쓸 수 있는 카메라를 못 찾았어요.')
      case 'NotReadableError':
        throw new Error(
          '카메라를 다른 프로그램이 쓰고 있어요. 화상회의 앱을 닫고 다시 시도해 주세요.',
        )
      default:
        throw new Error(`카메라를 열지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

export interface VisionSample {
  /** performance.now() 기준 ms */
  t: number
  faceFound: boolean
  /** 사용자 기준 yaw(도). + = 자기 왼쪽을 봄. 얼굴을 못 찾으면 0 */
  yawDeg: number
  handFound: boolean
  /** (손목x − 얼굴중심x)를 프레임 너비 대비 비율로. + = 손이 사용자의 왼쪽 */
  handOffset: number
  /** 캘리브레이션 화면에서만 쓰는 진단값 */
  debug: VisionDebug | null
}

export interface VisionDebug {
  /** 얼굴 변환행렬 원본 (4x4, 평탄화) */
  matrix: number[]
  /**
   * 랜드마크만으로 낸 yaw 근사값. 변환행렬 방식과 부호·경향이 일치하는지
   * 교차검증하는 용도다. 둘이 어긋나면 행렬 해석이 틀린 것이다.
   */
  noseRatio: number
}

export interface VisionOptions {
  face: boolean
  hand: boolean
  /** 캘리브레이션에서만 켠다. 매 프레임 배열을 복사하므로 게임 중에는 끈다 */
  debug?: boolean
}

/**
 * 웹캠 프레임 하나를 읽어 측정값을 낸다.
 *
 * detectForVideo는 타임스탬프가 단조증가해야 하므로 내부에서 마지막 값을 기억하고
 * 같거나 작은 값이 들어오면 밀어준다. 같은 프레임을 두 번 넣는 것도 막는다.
 */
export class VisionSampler {
  private face: FaceLandmarker | null = null
  private hand: HandLandmarker | null = null
  private lastTimestamp = -1
  private readonly debug: boolean
  /** 원본 x → 사용자 기준 x 부호. 프레임 좌표를 사용자 좌표로 옮기는 유일한 지점 */
  private readonly xSign: number

  private constructor(
    face: FaceLandmarker | null,
    hand: HandLandmarker | null,
    debug: boolean,
    userLeftIsPositiveX: boolean,
  ) {
    this.face = face
    this.hand = hand
    this.debug = debug
    this.xSign = userLeftIsPositiveX ? 1 : -1
  }

  static async create(
    options: VisionOptions,
    userLeftIsPositiveX = USER_LEFT_IS_POSITIVE_X,
  ): Promise<VisionSampler> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)

    // GPU 델리게이트가 안 되는 환경(구형 드라이버, 원격 데스크톱)이 있어 CPU로 떨어뜨린다.
    async function withFallback<T>(make: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
      try {
        return await make('GPU')
      } catch {
        return await make('CPU')
      }
    }

    const face = options.face
      ? await withFallback((delegate) =>
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFacialTransformationMatrixes: true,
            outputFaceBlendshapes: false,
          }),
        )
      : null

    const hand = options.hand
      ? await withFallback((delegate) =>
          HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate },
            runningMode: 'VIDEO',
            numHands: 1,
          }),
        )
      : null

    return new VisionSampler(face, hand, options.debug ?? false, userLeftIsPositiveX)
  }

  /**
   * 프레임 하나를 판정한다. 비디오가 아직 준비 안 됐으면 null.
   * 호출자는 requestVideoFrameCallback이나 rAF 루프에서 부르면 된다.
   */
  sample(video: HTMLVideoElement, now = performance.now()): VisionSample | null {
    if (video.readyState < 2 || video.videoWidth === 0) return null

    const timestamp = now > this.lastTimestamp ? now : this.lastTimestamp + 1
    this.lastTimestamp = timestamp

    let faceFound = false
    let yawDeg = 0
    let centerX = 0.5
    let debug: VisionDebug | null = null

    if (this.face) {
      const result = this.face.detectForVideo(video, timestamp)
      const landmarks = result.faceLandmarks[0]
      const matrix = result.facialTransformationMatrixes[0]
      if (landmarks && matrix) {
        faceFound = true
        yawDeg = yawFromMatrix(matrix) * this.xSign
        centerX = faceCenterX(landmarks)
        if (this.debug) {
          debug = { matrix: [...matrix.data], noseRatio: noseRatioFrom(landmarks) * this.xSign }
        }
      }
    }

    let handFound = false
    let handOffset = 0

    if (this.hand) {
      const result = this.hand.detectForVideo(video, timestamp)
      const wrist = result.landmarks[0]?.[WRIST]
      if (wrist) {
        handFound = true
        // 얼굴을 못 찾았으면 프레임 중앙을 기준으로 삼는다 (없는 것보다 낫다)
        handOffset = (wrist.x - centerX) * this.xSign
      }
    }

    return { t: now, faceFound, yawDeg, handFound, handOffset, debug }
  }

  close() {
    this.face?.close()
    this.hand?.close()
    this.face = null
    this.hand = null
  }
}
