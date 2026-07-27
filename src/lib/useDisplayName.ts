import { useCallback, useEffect, useState } from 'react'
import { getSavedDisplayName, saveDisplayName } from './room'

const CHANGED_EVENT = 'og:display-name-changed'

/**
 * 표시 이름은 사이트에 처음 들어올 때 한 번만 정하고 계속 재사용한다.
 * 같은 탭 안의 다른 컴포넌트도 즉시 반영되도록 커스텀 이벤트로 알린다.
 */
export function useDisplayName() {
  const [name, setName] = useState(getSavedDisplayName)

  useEffect(() => {
    const sync = () => setName(getSavedDisplayName())
    window.addEventListener(CHANGED_EVENT, sync)
    return () => window.removeEventListener(CHANGED_EVENT, sync)
  }, [])

  const update = useCallback((next: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    saveDisplayName(trimmed)
    window.dispatchEvent(new Event(CHANGED_EVENT))
  }, [])

  return { name, setDisplayName: update }
}
