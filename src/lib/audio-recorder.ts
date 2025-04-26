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

import { audioContext } from "./utils";
import AudioRecordingWorklet from "./worklets/audio-processing";
import VolMeterWorket from "./worklets/vol-meter";

import { createWorketFromSrc } from "./audioworklet-registry";
import EventEmitter from "eventemitter3";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Global variables to track if we've initialized for iOS
let hasUserInteractedWithAudio = false;
let isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

// Capture user gesture early to unlock audio on iOS
if (isIOSDevice) {
  const handleUserInteraction = () => {
    if (!hasUserInteractedWithAudio) {
      // Just creating an audio context and resuming it on user gesture helps iOS
      const tempContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      tempContext.resume().then(() => {
        hasUserInteractedWithAudio = true;
        // Can close it as we just needed the user gesture
        tempContext.close();
      }).catch(console.error);
    }
  };

  // Listen for user interactions to unlock audio
  window.addEventListener('touchstart', handleUserInteraction, { once: true });
  window.addEventListener('mousedown', handleUserInteraction, { once: true });
  window.addEventListener('keydown', handleUserInteraction, { once: true });
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;
  
  // Track if worklets have been loaded
  private workletLoaded: boolean = false;
  private starting: Promise<void> | null = null;
  private userPermissionGranted: boolean = false;

  constructor(public sampleRate = 16000) {
    super();
    this.initializeAudioContext();
  }

  // Initialize audio context early - iOS prefers this
  private async initializeAudioContext() {
    try {
      this.audioContext = await audioContext({ sampleRate: this.sampleRate });
      
      // Preload worklets if possible
      if (this.audioContext) {
        await this.preloadWorklets();
      }
    } catch (error) {
      console.log("Audio context will be initialized on first user interaction");
    }
  }

  // Preload the audio worklets
  private async preloadWorklets() {
    if (this.workletLoaded || !this.audioContext) return;
    
    try {
      const workletName = "audio-recorder-worklet";
      const src = createWorketFromSrc(workletName, AudioRecordingWorklet);
      await this.audioContext.audioWorklet.addModule(src);
      
      const vuWorkletName = "vu-meter";
      await this.audioContext.audioWorklet.addModule(
        createWorketFromSrc(vuWorkletName, VolMeterWorket)
      );
      
      this.workletLoaded = true;
    } catch (error) {
      console.error("Failed to preload worklets", error);
    }
  }

  // Request user permission for the microphone
  async requestPermission() {
    if (this.userPermissionGranted) return true;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // We don't need to keep this stream, just needed to request permission
      stream.getTracks().forEach(track => track.stop());
      
      this.userPermissionGranted = true;
      return true;
    } catch (error) {
      console.error("Microphone permission denied", error);
      return false;
    }
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Could not request user media");
    }

    // If already recording, do nothing
    if (this.recording && this.stream) {
      return;
    }

    // Disconnect any existing resources
    this.disconnectResources();

    // First ensure we have permission
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      throw new Error("Microphone permission denied");
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        // Ensure we have an audio context
        if (!this.audioContext) {
          this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        }
        
        // iOS requires the audio context to be resumed within a user gesture
        if (this.audioContext.state !== "running") {
          await this.audioContext.resume();
        }
        
        // Request the actual stream we'll use
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        // Ensure worklets are loaded
        if (!this.workletLoaded) {
          await this.preloadWorklets();
        }

        // Create the recording worklet
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          "audio-recorder-worklet"
        );

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          const arrayBuffer = ev.data.data.int16arrayBuffer;

          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit("data", arrayBufferString);
          }
        };
        this.source.connect(this.recordingWorklet);

        // Create the VU meter worklet
        this.vuWorklet = new AudioWorkletNode(this.audioContext, "vu-meter");
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit("volume", ev.data.volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
        resolve();
      } catch (error) {
        console.error("Error starting audio recorder:", error);
        reject(error);
      } finally {
        this.starting = null;
      }
    });
    
    return this.starting;
  }

  stop() {
    // If we're in the middle of starting, wait for that to finish
    if (this.starting) {
      this.starting.then(() => this.disconnectResources()).catch(() => {});
      return;
    }
    
    this.disconnectResources();
  }
  
  // Separate method to disconnect resources to avoid code duplication
  private disconnectResources() {
    // Disconnect and clean up the source
    if (this.source) {
      this.source.disconnect();
      this.source = undefined;
    }
    
    // Stop all tracks in the stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = undefined;
    }
    
    // Reset worklet references
    this.recordingWorklet = undefined;
    this.vuWorklet = undefined;
    this.recording = false;
    
    // Notice we DON'T close the audioContext - on iOS this can cause problems
    // when trying to reuse audio later. Instead, we keep it and reuse it.
  }
}
