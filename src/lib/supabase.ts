import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다. .env.local을 확인하세요.',
  )
}

// createClient는 URL 형식을 즉시 검증하므로, 값이 없을 때 빈 문자열을 넘기면
// 모듈 평가 중 바로 throw되어 앱 전체가 조용히 죽는다. 자리표시자 URL로 방지.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder')
