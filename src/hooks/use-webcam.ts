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

import { useState, useEffect } from "react";
import { UseMediaStreamResult } from "./use-media-stream-mux";
import { isMobileDevice } from "../lib/utils";

// Type augmentation for iOS Safari standalone mode
interface IOSNavigator extends Navigator {
  standalone?: boolean;
}

export function useWebcam(): UseMediaStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const handleStreamEnded = () => {
      setIsStreaming(false);
      setStream(null);
    };
    if (stream) {
      stream
        .getTracks()
        .forEach((track) => track.addEventListener("ended", handleStreamEnded));
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
    // Release any existing stream first
    if (stream) {
      stop();
    }
    
    // Check for iOS standalone mode (PWA) to apply special handling if needed
    const isIOSStandalone = typeof (window.navigator as IOSNavigator).standalone !== 'undefined'
      ? (window.navigator as IOSNavigator).standalone
      : false;
    
    // Base constraints with higher resolution to prevent iOS issues
    const baseConstraints = {
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    };
    
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
          setStream(mediaStream);
          setIsStreaming(true);
          return mediaStream;
        } catch (err) {
          console.log("Rear camera failed:", err);
          
          // Second try: Any camera
          console.log("Trying with any camera...");
          const anyCamera = await navigator.mediaDevices.getUserMedia(baseConstraints);
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
        const mediaStream = await navigator.mediaDevices.getUserMedia(baseConstraints);
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
