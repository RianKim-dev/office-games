/**
 * 랜드마크·행렬에서 각도를 뽑는 순수 계산. MediaPipe를 import하지 않는다.
 *
 * vision.ts에서 떼어낸 이유는 두 가지다. 이 계산이 웹캠 없이 테스트 가능해야 하고,
 * @mediapipe/tasks-vision를 import하면 그것만으로 wasm 로더가 딸려와 node에서
 * 테스트를 못 돌리기 때문이다.
 */

/** MediaPipe의 Matrix와 구조적으로 호환되는 최소 형태 */
export interface Mat {
  rows: number
  data: number[]
}

/** 필요한 랜드마크만 (MediaPipe NormalizedLandmark와 호환) */
export interface Point {
  x: number
  y: number
}

/** 얼굴 좌우 끝. 이 둘의 중점을 얼굴 중심으로 쓴다 — 코끝과 달리 고개를 돌려도 덜 흔들린다 */
export const FACE_EDGE_L = 234
export const FACE_EDGE_R = 454
export const NOSE_TIP = 1
/** 손목 */
export const WRIST = 0

/** 열 우선(column-major) 평탄화: data[col * rows + row] */
function at(m: Mat, row: number, col: number): number {
  return m.data[col * m.rows + row]
}

/**
 * 얼굴 변환행렬에서 yaw(도)를 뽑는다.
 *
 * 회전행렬의 3번째 열은 모델의 +Z축(얼굴이 향하는 방향)이 카메라 좌표계에서
 * 어디를 가리키는지를 준다. 그 벡터를 XZ 평면에 눕혀 각도를 재면 yaw다.
 *
 * 정면을 볼 때 Z 성분의 부호가 구현에 따라 갈려 결과가 0이 아니라 ±180 근처로
 * 나올 수 있다. 우리가 쓰는 구간은 어차피 [-90, 90]이고(그보다 더 돌리면 얼굴
 * 추적 자체가 끊긴다) 90°를 넘는 값은 반대편을 본다는 뜻이 아니라 부호 규약
 * 차이이므로, 접어서 [-90, 90]으로 정규화한다. 덕분에 두 규약 어느 쪽이든
 * 같은 답이 나온다.
 */
export function yawFromMatrix(m: Mat): number {
  const forwardX = at(m, 0, 2)
  const forwardZ = at(m, 2, 2)
  let deg = (Math.atan2(forwardX, forwardZ) * 180) / Math.PI
  if (deg > 90) deg -= 180
  else if (deg < -90) deg += 180
  return deg
}

/**
 * 랜드마크만으로 낸 yaw 근사. 머리를 원통으로 보면 코끝의 좌우 치우침은
 * sin(yaw)에, 얼굴 폭은 cos(yaw)에 비례하므로 그 비가 tan(yaw)에 비례한다.
 *
 * 사람마다 코 높이가 달라 절대 각도로는 못 쓰지만 부호와 증감 경향은 정확하다.
 * 변환행렬 해석이 맞는지 대조하는 용도로만 쓴다.
 */
export function noseRatioFrom(landmarks: Point[]): number {
  const left = landmarks[FACE_EDGE_L]
  const right = landmarks[FACE_EDGE_R]
  const nose = landmarks[NOSE_TIP]
  if (!left || !right || !nose) return 0
  const halfWidth = Math.abs(right.x - left.x) / 2
  if (halfWidth < 1e-6) return 0
  const centerX = (left.x + right.x) / 2
  return (nose.x - centerX) / halfWidth
}

export function faceCenterX(landmarks: Point[]): number {
  const left = landmarks[FACE_EDGE_L]
  const right = landmarks[FACE_EDGE_R]
  if (!left || !right) return 0.5
  return (left.x + right.x) / 2
}
