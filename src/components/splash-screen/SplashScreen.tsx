import React, { useState, useEffect } from 'react';
import './splash-screen.scss';

interface SplashScreenProps {
  onComplete?: () => void;
  minDisplayTime?: number;
}

const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  minDisplayTime = 2000, // Minimum display time in milliseconds
}) => {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState<number>(Date.now());

  // Simulate loading progress
  useEffect(() => {
    if (progress >= 100) {
      const elapsedTime = Date.now() - startTime;
      
      // Ensure the splash screen stays visible for the minimum display time
      if (elapsedTime >= minDisplayTime) {
        setLoading(false);
        if (onComplete) onComplete();
      } else {
        const remainingTime = minDisplayTime - elapsedTime;
        setTimeout(() => {
          setLoading(false);
          if (onComplete) onComplete();
        }, remainingTime);
      }
      return;
    }

    // Update progress every 100ms
    const timer = setTimeout(() => {
      // Random progress increment between 1% and 5%
      const increment = Math.floor(Math.random() * 5) + 1;
      // Ensure we don't exceed 100%
      setProgress(prev => Math.min(prev + increment, 100));
    }, 100);

    return () => clearTimeout(timer);
  }, [progress, onComplete, minDisplayTime, startTime]);

  if (!loading) return null;

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <h1 className="splash-title">Loading App...</h1>
        <div className="progress-container">
          <div 
            className="progress-bar" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen; 