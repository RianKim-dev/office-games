import { Route, Routes } from 'react-router-dom'
import Landing from './components/Landing'
import BingoSetup from './games/bingo/BingoSetup'
import BingoRoom from './games/bingo/BingoRoom'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/new" element={<BingoSetup />} />
      <Route path="/room/:code" element={<BingoRoom />} />
    </Routes>
  )
}
