import React, { useEffect, useState } from 'react';
import '../styles/SplashScreen.css';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prevProgress => {
        if (prevProgress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            onComplete();
          }, 500);
          return 100;
        }
        return prevProgress + 1;
      });
    }, 30);
    
    return () => clearInterval(interval);
  }, [onComplete]);
  
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="logo-container">
          <img 
            src="/splash-big-2.png" 
            alt="App Logo" 
            className="splash-logo"
          />
        </div>
        <div className="progress-container">
          <div 
            className="progress-bar" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="progress-text">{progress}%</div>
      </div>
    </div>
  );
};

export default SplashScreen; 