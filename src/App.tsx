import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Landing from './components/Landing'
import BingoSetup from './games/bingo/BingoSetup'
import BingoRoom from './games/bingo/BingoRoom'

// 참참참 화면은 MediaPipe 번들(152KB)을 끌고 오므로 빙고만 하는 사람에게는 안 보낸다
const ChamLab = lazy(() => import('./games/cham/ChamLab'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/new" element={<BingoSetup />} />
      <Route path="/room/:code" element={<BingoRoom />} />
      <Route
        path="/cham/lab"
        element={
          <Suspense fallback={<div style={{ padding: 20 }}>불러오는 중…</div>}>
            <ChamLab />
          </Suspense>
        }
      />
    </Routes>
  )
}
