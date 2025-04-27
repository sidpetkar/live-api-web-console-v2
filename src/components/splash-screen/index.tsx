/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useEffect, useState } from 'react';
import './splash-screen.scss';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  
  // Get the splash image URL
  const splashImageUrl = `${process.env.PUBLIC_URL}/splash-big-2.png`;

  // Simulate loading progress
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prevProgress) => {
        if (prevProgress >= 100) {
          clearInterval(interval);
          return 100;
        }
        
        // Speed up progress as it gets closer to completion
        const increment = prevProgress < 50 ? 2 : prevProgress < 80 ? 1 : 0.5;
        return Math.min(prevProgress + increment, 100);
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Handle completion of loading
  useEffect(() => {
    if (progress === 100) {
      const timeout = setTimeout(() => {
        setIsComplete(true);
        onComplete();
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [progress, onComplete]);

  return (
    <div 
      className="splash-screen" 
      style={{ 
        opacity: isComplete ? 0 : 1, 
        transition: 'opacity 0.5s ease-in-out' 
      }}
    >
      <img 
        src={splashImageUrl} 
        alt="Background" 
        className="splash-background" 
        onError={(e) => {
          console.error("Failed to load splash image");
          e.currentTarget.style.display = 'none';
        }}
      />
      <div className="splash-content">
        <h1 className="title">VisionSync</h1>
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen; 