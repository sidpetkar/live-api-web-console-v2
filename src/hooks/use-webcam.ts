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

import { useState, useEffect, useRef, useCallback } from "react";
import { UseMediaStreamResult } from "./use-media-stream-mux";
import { isMobileDevice } from "../lib/utils";

// Type augmentation for iOS Safari standalone mode
interface IOSNavigator extends Navigator {
  standalone?: boolean;
}

// Check if we're in iOS PWA mode
const isInStandaloneMode = () => {
  return typeof (window.navigator as IOSNavigator).standalone !== 'undefined'
    ? (window.navigator as IOSNavigator).standalone
    : window.matchMedia('(display-mode: standalone)').matches;
};

// Check if we're on iOS specifically
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

export function useWebcam(): UseMediaStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamAttemptCount = useRef(0);
  const lastStreamTime = useRef(0);
  const timerId = useRef<any>(null);
  
  // Function to reset the camera stream
  const resetCameraStream = useCallback(async () => {
    if (stream) {
      // Stop the current stream
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsStreaming(false);
      
      // Attempt to restart after a short delay
      setTimeout(() => {
        console.log("Attempting to restart camera after visibility change");
        start().catch(err => console.error("Camera restart failed:", err));
      }, 500);
    }
  }, [stream]);

  // Handle app becoming visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // If it's been more than 2 seconds since we last accessed the stream
        const timeSinceLastStream = Date.now() - lastStreamTime.current;
        if (timeSinceLastStream > 2000 && isStreaming) {
          console.log("App became visible again, resetting camera");
          resetCameraStream();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isStreaming, resetCameraStream]);
  
  // Handle installed app going to background and back
  useEffect(() => {
    // For PWA, handle blur/focus events
    if (isInStandaloneMode()) {
      const handleAppBlur = () => {
        console.log("App lost focus");
      };
      
      const handleAppFocus = () => {
        console.log("App gained focus, checking camera");
        // If streaming but stream might be stale
        if (isStreaming && stream) {
          const tracks = stream.getVideoTracks();
          // Check if camera track is still active
          if (!tracks.length || !tracks[0].enabled || tracks[0].readyState !== 'live') {
            console.log("Camera track not active, resetting");
            resetCameraStream();
          }
        }
      };
      
      window.addEventListener('blur', handleAppBlur);
      window.addEventListener('focus', handleAppFocus);
      
      return () => {
        window.removeEventListener('blur', handleAppBlur);
        window.removeEventListener('focus', handleAppFocus);
      };
    }
  }, [isStreaming, stream, resetCameraStream]);

  // Monitor camera stream health
  useEffect(() => {
    if (stream && isStreaming) {
      // Start a periodic check for camera health
      if (timerId.current) clearInterval(timerId.current);
      
      timerId.current = setInterval(() => {
        if (stream) {
          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 0) {
            const track = videoTracks[0];
            
            // Check if track appears inactive despite being "enabled"
            if (track.enabled && track.readyState === 'live') {
              // Get video settings to verify camera is working
              try {
                const settings = track.getSettings();
                // If we can't get width/height or they're zero, camera might be stuck
                if (!settings.width || !settings.height) {
                  console.log("Camera settings unavailable, may need reset");
                  resetCameraStream();
                }
              } catch (e) {
                console.warn("Couldn't get camera settings:", e);
              }
            }
          }
        }
      }, 3000);
      
      return () => {
        if (timerId.current) {
          clearInterval(timerId.current);
          timerId.current = null;
        }
      };
    }
  }, [stream, isStreaming, resetCameraStream]);

  useEffect(() => {
    const handleStreamEnded = () => {
      console.log("Stream track ended event detected");
      setIsStreaming(false);
      setStream(null);
    };
    
    if (stream) {
      stream
        .getTracks()
        .forEach((track) => {
          track.addEventListener("ended", handleStreamEnded);
          // Force enable the track in case it got disabled
          track.enabled = true;
        });
        
      return () => {
        stream
          .getTracks()
          .forEach((track) =>
            track.removeEventListener("ended", handleStreamEnded),
          );
      };
    }
  }, [stream]);

  const start = async () => {
    // Record attempt time
    lastStreamTime.current = Date.now();
    streamAttemptCount.current++;
    console.log(`Starting camera, attempt #${streamAttemptCount.current}`);
    
    // Release any existing stream first
    if (stream) {
      stop();
    }
    
    // Special handling for iOS installed PWA
    const isStandalone = isInStandaloneMode();
    const isIOSDevice = isIOS();
    
    if (isStandalone) {
      console.log("Running in standalone PWA mode", isIOSDevice ? "on iOS" : "");
    }
    
    // iOS requires specific handling for camera
    if (isIOSDevice) {
      // For iOS, we need a user interaction to start the camera
      // Adding a small delay can help iOS initialize camera properly
      await new Promise(resolve => setTimeout(resolve, 300));
      
      try {
        // iOS PWA: Try with minimal, more compatible constraints first
        console.log("iOS: Using minimal camera constraints to ensure compatibility");
        const iOSStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "environment",
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });
        
        console.log("iOS camera access successful");
        
        // Force camera initialization with a short delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        lastStreamTime.current = Date.now();
        setStream(iOSStream);
        setIsStreaming(true);
        
        // Check if we actually got a working video track
        const videoTracks = iOSStream.getVideoTracks();
        if (videoTracks.length > 0) {
          const track = videoTracks[0];
          console.log(`Camera track obtained: ${track.label}, enabled: ${track.enabled}`);
          
          // On iOS, force enable the track after a short delay
          setTimeout(() => {
            if (track && track.readyState === 'live') {
              track.enabled = true;
              console.log("Re-enabled camera track after delay");
            }
          }, 500);
        }
        
        return iOSStream;
      } catch (iOSError) {
        console.error("iOS-specific camera attempt failed:", iOSError);
        // Fall through to general handling
      }
    }
    
    // For mobile devices, we try a sequence of different constraints
    if (isMobileDevice()) {
      try {
        // First try: Environment facing camera explicitly
        const envConstraints = {
          audio: false,
          video: {
            facingMode: { exact: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        
        try {
          console.log("Attempting to access rear camera...");
          const mediaStream = await navigator.mediaDevices.getUserMedia(envConstraints);
          // Mark current time as successful
          lastStreamTime.current = Date.now();
          setStream(mediaStream);
          setIsStreaming(true);
          return mediaStream;
        } catch (err) {
          console.log("Rear camera failed:", err);
          
          // Second try: Any camera
          console.log("Trying with any camera...");
          const anyCamera = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
          });
          lastStreamTime.current = Date.now();
          setStream(anyCamera);
          setIsStreaming(true);
          return anyCamera;
        }
      } catch (error) {
        console.error("Camera access failed:", error);
        
        // Last attempt: Most basic constraints
        try {
          console.log("Making one final attempt with minimal constraints");
          const basicStream = await navigator.mediaDevices.getUserMedia({ video: true });
          lastStreamTime.current = Date.now();
          setStream(basicStream);
          setIsStreaming(true);
          return basicStream;
        } catch (finalError) {
          console.error("All camera access attempts failed:", finalError);
          throw finalError;
        }
      }
    } else {
      // For desktop, use standard constraints
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });
        lastStreamTime.current = Date.now();
        setStream(mediaStream);
        setIsStreaming(true);
        return mediaStream;
      } catch (error) {
        console.error("Desktop camera access failed:", error);
        throw error;
      }
    }
  };

  const stop = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsStreaming(false);
    }
    
    // Clear any pending timers
    if (timerId.current) {
      clearInterval(timerId.current);
      timerId.current = null;
    }
  };

  const result: UseMediaStreamResult = {
    type: "webcam",
    start,
    stop,
    isStreaming,
    stream,
  };

  return result;
}
