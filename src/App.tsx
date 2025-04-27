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

import { useRef, useState, useEffect } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import ControlTray from "./components/control-tray/ControlTray";
import cn from "classnames";
import SettingsDialog from "./components/settings-dialog/SettingsDialog";
import SplashScreen from "./components/splash-screen";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const host = "generativelanguage.googleapis.com";
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

// Get the background image URL
const bgImageUrl = process.env.PUBLIC_URL + '/bg-2.png';

function App() {
  // this video reference is used for displaying the active stream, whether that is the webcam or screen capture
  // feel free to style as you see fit
  const videoRef = useRef<HTMLVideoElement>(null);
  // either the screen capture, the video or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  // State to control the splash screen visibility - TEMPORARY: Set to false to skip splash screen
  const [loading, setLoading] = useState(false);
  // State to control the fade-in animation of the main app
  const [appVisible, setAppVisible] = useState(true);
  // State to control the zoom animation of the background image
  const [bgZoomed, setBgZoomed] = useState(false);
  // Reference to store the wake lock
  const wakeLockRef = useRef<any>(null);
  
  // Trigger the zoom effect with a minimal delay to ensure animation is visible
  useEffect(() => {
    // Use requestAnimationFrame to ensure the browser has rendered the initial state
    requestAnimationFrame(() => {
      // Add a very small timeout to ensure the initial state is rendered first
      setTimeout(() => {
        setBgZoomed(true);
      }, 50);
    });
    
    // Prevent scrolling completely
    const preventScroll = (e: Event) => {
      e.preventDefault();
    };
    
    const preventScrollOptions = { passive: false };
    
    // Add scroll prevention to various events
    document.addEventListener('touchmove', preventScroll, preventScrollOptions);
    document.addEventListener('wheel', preventScroll, preventScrollOptions);
    document.addEventListener('scroll', preventScroll, preventScrollOptions);
    
    // Prevent pull-to-refresh on mobile
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';
    
    return () => {
      // Cleanup event listeners
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('scroll', preventScroll);
    };
  }, []);

  // Wake Lock implementation to keep screen on
  useEffect(() => {
    // Function to request wake lock
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          
          console.log('Wake Lock is active');
          
          // Add listener to reacquire wake lock if it's released
          wakeLockRef.current.addEventListener('release', () => {
            console.log('Wake Lock was released');
            // Try to reacquire the wake lock if page is still visible
            if (document.visibilityState === 'visible') {
              requestWakeLock();
            }
          });
          
          // Handle visibility change to reacquire wake lock
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !wakeLockRef.current) {
              requestWakeLock();
            }
          });
        } else {
          console.log('Wake Lock API not supported');
        }
      } catch (err) {
        console.error(`Failed to acquire Wake Lock: ${err}`);
      }
    };
    
    // Initialize wake lock
    requestWakeLock();
    
    // Clean up on component unmount
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
          .then(() => {
            wakeLockRef.current = null;
            console.log('Wake Lock released on unmount');
          })
          .catch((err: any) => {
            console.error(`Error releasing Wake Lock: ${err}`);
          });
      }
    };
  }, []);

  // Function to handle splash screen completion
  const handleSplashComplete = () => {
    // When splash screen completes, trigger the transition and zoom effect simultaneously
    setAppVisible(true);
    setBgZoomed(true);

    // After a short delay, remove the splash screen completely
    setTimeout(() => {
      setLoading(false);
    }, 800);
  };

  return (
    <div className="App">
      {loading && <SplashScreen onComplete={handleSplashComplete} />}
      
      <div 
        className={cn("app-container", {
          'app-visible': appVisible,
          'hidden': !appVisible && !loading
        })}
      >
        <LiveAPIProvider url={uri} apiKey={API_KEY}>
          <div className="streaming-console">
            <div 
              className={cn("background-image", {
                'bg-zoomed': bgZoomed
              })} 
              style={{ backgroundImage: `url(${bgImageUrl})` }}
            />
            
            <main>
              {/* Text Overlay Container */}
              <div 
                className={cn(
                  "text-overlay-container", 
                  { 
                    'text-visible': bgZoomed, // For initial animation
                    'text-hidden': !!videoStream // Hide when camera is on
                  }
                )}
              >
                <h1 className="overlay-title">VisionSync</h1>
                <p className="overlay-subtitle">Experience a new way to capture, understand, and interact with the world around you</p>
                <img src="/eye.png" alt="Eye icon" className="overlay-icon" />
                <p className="overlay-credit">
                  A Multimodal Experiment by <a href="https://x.com/siddhantpetkar" target="_blank" rel="noopener noreferrer">@sidpetkar</a>
                </p>
              </div>
              
              <div className="settings-wrapper">
                <SettingsDialog />
              </div>
              
              <video
                className={cn("stream", {
                  hidden: !videoRef.current || !videoStream,
                })}
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />

              <ControlTray
                videoRef={videoRef}
                supportsVideo={true}
                onVideoStreamChange={setVideoStream}
                enableEditingSettings={false}
              />
            </main>
          </div>
        </LiveAPIProvider>
      </div>
    </div>
  );
}

export default App;
