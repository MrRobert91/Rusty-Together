import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { installInput } from './core/input'
import { useSettings } from './core/settings'
import './ui/styles.css'

installInput()
// Test / weak-GPU switch: ?low forces the cheap pipeline for this session.
if (new URLSearchParams(location.search).has('low')) useSettings.setState({ quality: 'low' })
if (new URLSearchParams(location.search).has('high')) useSettings.setState({ quality: 'high' })
createRoot(document.getElementById('root')!).render(<App />)
