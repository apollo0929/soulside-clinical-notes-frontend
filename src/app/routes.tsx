import { Route, Routes } from 'react-router-dom'

import { HomePage } from '@/app/pages/HomePage'
import { NotFoundPage } from '@/app/pages/NotFoundPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
