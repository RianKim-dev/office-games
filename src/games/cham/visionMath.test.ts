import { describe, expect, it } from 'vitest'
import { faceCenterX, noseRatioFrom, yawFromMatrix, type Mat, type Point } from './visionMath'

/**
 * Y축 회전행렬을 MediaPipe와 같은 열 우선 배치로 만든다.
 * forwardSign이 -1이면 "정면이 -Z"인 반대 규약을 흉내낸다.
 */
function ryMatrix(deg: number, forwardSign: 1 | -1): Mat {
  const t = (deg * Math.PI) / 180
  const s = Math.sin(t)
  const c = Math.cos(t)
  const R = [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ]
  const data = new Array(16).fill(0)
  data[15] = 1
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      data[col * 4 + row] = R[row][col] * (col === 2 ? forwardSign : 1)
    }
  }
  return { rows: 4, data }
}

describe('yawFromMatrix', () => {
  it.each([0, 15, 30, -30, 50, -50, 70])('%d도를 그대로 돌려준다', (deg) => {
    expect(yawFromMatrix(ryMatrix(deg, 1))).toBeCloseTo(deg, 5)
  })

  // 이게 이 함수의 존재 이유다. MediaPipe 빌드에 따라 정면의 Z 부호가 갈리는데,
  // ±180 접기 덕분에 어느 쪽이든 같은 각도가 나온다.
  it.each([0, 15, 30, -30, 50, -50, 70])('정면이 -Z인 규약에서도 %d도가 나온다', (deg) => {
    expect(yawFromMatrix(ryMatrix(deg, -1))).toBeCloseTo(deg, 5)
  })
})

function face(noseX: number, leftX = 0.4, rightX = 0.6): Point[] {
  const pts: Point[] = []
  pts[1] = { x: noseX, y: 0.5 }
  pts[234] = { x: leftX, y: 0.5 }
  pts[454] = { x: rightX, y: 0.5 }
  return pts
}

describe('noseRatioFrom', () => {
  it('정면이면 0', () => {
    expect(noseRatioFrom(face(0.5))).toBeCloseTo(0, 5)
  })

  it('코가 x가 큰 쪽으로 치우치면 양수', () => {
    expect(noseRatioFrom(face(0.56))).toBeGreaterThan(0)
  })

  it('얼굴 폭이 0이면 0으로 떨어뜨린다 (0으로 나누지 않는다)', () => {
    expect(noseRatioFrom(face(0.5, 0.5, 0.5))).toBe(0)
  })

  it('랜드마크가 없으면 0', () => {
    expect(noseRatioFrom([])).toBe(0)
  })
})

describe('faceCenterX', () => {
  it('좌우 끝의 중점', () => {
    expect(faceCenterX(face(0.5, 0.3, 0.7))).toBeCloseTo(0.5, 5)
  })

  it('랜드마크가 없으면 프레임 중앙으로 본다', () => {
    expect(faceCenterX([])).toBe(0.5)
  })
})
