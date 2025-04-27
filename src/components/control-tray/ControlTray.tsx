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

import cn from "classnames";

import { memo, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWebcam } from "../../hooks/use-webcam";
import { AudioRecorder } from "../../lib/audio-recorder";
import { isMobileDevice } from "../../lib/utils";
import AudioPulse from "../audio-pulse/AudioPulse";
import "./control-tray.scss";
import SettingsDialog from "../settings-dialog/SettingsDialog";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<any>;
  stop: () => any;
  className?: string;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({ isStreaming, onIcon, offIcon, start, stop, className }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className={cn("action-button", className)} onClick={stop}>
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start}>
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    )
);

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
  enableEditingSettings,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [inVolume, setInVolume] = useState(0);
  // Create a single persistent AudioRecorder
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);

  const { client, connected, connect, disconnect, volume } =
    useLiveAPIContext();

  // Request microphone permission early (helps with iOS)
  useEffect(() => {
    // Request permission as soon as possible
    audioRecorder.requestPermission().catch(err => {
      console.log("Initial permission request deferred to user interaction", err);
    });
  }, [audioRecorder]);

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--volume",
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on("data", onData).on("volume", setInVolume).start();
    } else {
      audioRecorder?.stop();
    }
    return () => {
      audioRecorder?.off("data", onData).off("volume", setInVolume);
    };
  }, [connected, client, muted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }

    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    }
    if (connected && activeVideoStream !== null) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef]);

  // Stop all video streams when disconnecting
  useEffect(() => {
    if (!connected && activeVideoStream) {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
      videoStreams.forEach((msr) => msr.stop());
    }
  }, [connected, activeVideoStream, onVideoStreamChange, videoStreams]);

  //handler for swapping from one video-stream to the next
  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  // Custom disconnect handler that also stops video streams
  const handleDisconnect = () => {
    // First stop video streams
    setActiveVideoStream(null);
    onVideoStreamChange(null);
    videoStreams.forEach(stream => stream.stop());
    
    // Then disconnect
    disconnect();
  };
  
  // Enforce video stream to be attached to video element
  useEffect(() => {
    if (activeVideoStream && videoRef.current) {
      console.log("Setting active video stream to video element");
      videoRef.current.srcObject = activeVideoStream;
      
      // iOS requires playing the video immediately after setting srcObject
      const playVideo = async () => {
        if (videoRef.current) {
          try {
            // Sometimes we need to wait a bit for iOS to initialize
            setTimeout(async () => {
              try {
                if (videoRef.current) {
                  await videoRef.current.play();
                  console.log("Video playback started");
                }
              } catch (delayedError) {
                console.warn("Delayed play failed:", delayedError);
              }
            }, 300);
            
            // Try immediate play as well
            await videoRef.current.play();
          } catch (e) {
            console.warn("Initial video play failed, will retry:", e);
          }
        }
      };
      
      playVideo();
    }
  }, [activeVideoStream, videoRef]);
  
  // Handler for webcam button with enhanced iOS handling
  const startWebcam = async () => {
    try {
      console.log("Starting webcam with enhanced iOS handling");
      // First make sure any previous streams are stopped
      videoStreams.filter(msr => msr !== webcam).forEach(msr => msr.stop());
      
      // Start webcam
      const mediaStream = await webcam.start();
      console.log("Webcam started, got media stream");
      
      // Set stream and update video element
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
      
      if (videoRef.current) {
        // Make sure srcObject is set
        videoRef.current.srcObject = mediaStream;
        
        // iOS PWA needs additional handling
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                             (navigator as any).standalone;
        
        if (isIOS && isStandalone) {
          console.log("iOS PWA detected, using enhanced video playback handling");
          
          // Force multiple play attempts with different timing
          const playVideo = async () => {
            if (videoRef.current) {
              try {
                // First attempt
                await videoRef.current.play();
                console.log("Video playback started (first attempt)");
              } catch (e) {
                console.warn("First play attempt failed:", e);
                
                // Second attempt after a short delay
                setTimeout(async () => {
                  try {
                    if (videoRef.current) {
                      // Make sure video element is properly configured
                      videoRef.current.autoplay = true;
                      videoRef.current.playsInline = true;
                      videoRef.current.muted = true;
                      
                      await videoRef.current.play();
                      console.log("Video playback started (second attempt)");
                    }
                  } catch (delayedError) {
                    console.warn("Second play attempt failed:", delayedError);
                    
                    // Last attempt with longer delay and forcing reload
                    setTimeout(async () => {
                      try {
                        if (videoRef.current) {
                          videoRef.current.srcObject = null;
                          videoRef.current.srcObject = mediaStream;
                          await videoRef.current.play();
                          console.log("Video playback started (final attempt)");
                        }
                      } catch (finalError) {
                        console.error("All play attempts failed:", finalError);
                      }
                    }, 800);
                  }
                }, 300);
              }
            }
          };
          
          // Make multiple play attempts
          playVideo();
        } else {
          // Non-iOS standard handling
          try {
            await videoRef.current.play();
            console.log("Video playback started from button handler");
          } catch (e) {
            console.warn("Play from button handler failed:", e);
          }
        }
      }
      
      return mediaStream;
    } catch (error) {
      console.error("Failed to start webcam:", error);
      throw error;
    }
  };

  return (
    <section className="control-tray">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />
      <nav className={cn("actions-nav", { disabled: !connected })}>
        <button
          className={cn("action-button mic-button")}
          onClick={async () => {
            // When unmuting, make sure we have permission (helps iOS)
            if (muted) {
              try {
                await audioRecorder.requestPermission();
              } catch (error) {
                console.error("Failed to get mic permission", error);
              }
            }
            
            setMuted(!muted);
          }}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>

        <div className="action-button no-action outlined">
          <AudioPulse volume={volume} active={connected} hover={false} />
        </div>

        {supportsVideo && (
          <>
            {/* Hide screen share button on mobile devices */}
            {!isMobileDevice() && (
            <MediaStreamButton
              isStreaming={screenCapture.isStreaming}
              start={changeStreams(screenCapture)}
              stop={changeStreams()}
              onIcon="cancel_presentation"
              offIcon="present_to_all"
              className={screenCapture.isStreaming ? "camera-active" : ""}
            />
            )}
            {/* Use enhanced webcam handler for iOS compatibility */}
            {webcam.isStreaming ? (
              <button 
                className="action-button camera-active"
                onClick={changeStreams()}
              >
                <span className="material-symbols-outlined">videocam_off</span>
              </button>
            ) : (
              <button 
                className="action-button"
                onClick={startWebcam}
              >
                <span className="material-symbols-outlined">videocam</span>
              </button>
            )}
          </>
        )}
        {children}
      </nav>

      <div className={cn("connection-container", { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn("action-button connect-toggle", { connected })}
            onClick={connected ? handleDisconnect : connect}
          >
            <span className="material-symbols-outlined filled">
              {connected ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
      {enableEditingSettings ? <SettingsDialog /> : ""}
    </section>
  );
}

export default memo(ControlTray);
