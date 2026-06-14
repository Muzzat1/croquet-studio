import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CourtMeasurements from './components/CourtMeasurements.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CourtMeasurements />
  </StrictMode>,
)
