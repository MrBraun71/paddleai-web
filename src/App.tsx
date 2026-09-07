import React, { useState } from 'react'
import HomeScreen from './components/HomeScreen'
import TrainingScreen from './components/TrainingScreen'
import RecapScreen from './components/RecapScreen'
import type { SessionData } from './types'

type ScreenState = 'home' | 'training' | 'recap'

const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>('home')
  const [voiceEnabled] = useState<boolean>(true)
  const [lastSession, setLastSession] = useState<SessionData | null>(null)

  const handleStart = () => {
    setScreen('training')
  }

  const handleComplete = (session: SessionData) => {
    setLastSession(session)
    setScreen('recap')
  }

  const handleExit = () => {
    setScreen('home')
  }

  switch (screen) {
    case 'home':
      return <HomeScreen onStart={handleStart} />
    case 'training':
      return (
        <TrainingScreen
          onComplete={handleComplete}
          onExit={handleExit}
          voiceEnabled={voiceEnabled}
        />
      )
    case 'recap':
      return lastSession ? (
        <RecapScreen
          session={lastSession}
          onHome={() => setScreen('home')}
          onPlayAnother={handleStart}
        />
      ) : (
        <HomeScreen onStart={handleStart} />
      )
    default:
      return <HomeScreen onStart={handleStart} />
  }
}

export default App
