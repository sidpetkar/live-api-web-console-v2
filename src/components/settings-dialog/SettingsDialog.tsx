import {
  ChangeEvent,
  FormEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./settings-dialog.scss";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { LiveConfig } from "../../multimodal-live-types";
import {
  FunctionDeclaration,
  FunctionDeclarationsTool,
  Tool,
} from "@google/generative-ai";
import VoiceSelector from "./VoiceSelector";
import ResponseModalitySelector from "./ResponseModalitySelector";

export default function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { config, setConfig, connected } = useLiveAPIContext();
  const functionDeclarations: FunctionDeclaration[] = useMemo(() => {
    if (!Array.isArray(config.tools)) {
      return [];
    }
    return (config.tools as Tool[])
      .filter((t: Tool): t is FunctionDeclarationsTool =>
        Array.isArray((t as any).functionDeclarations)
      )
      .map((t) => t.functionDeclarations)
      .filter((fc) => !!fc)
      .flat();
  }, [config]);

  const systemInstruction = useMemo(() => {
    const s = config.systemInstruction?.parts.find((p) => p.text)?.text || "";

    return s;
  }, [config]);

  useEffect(() => {
    if (dialogRef.current) {
      if (open) {
        if (!dialogRef.current.open) {
          dialogRef.current.showModal();
        }
      } else {
        if (dialogRef.current.open) {
          dialogRef.current.close();
        }
      }
    }
  }, [open]);

  const updateConfig: FormEventHandler<HTMLTextAreaElement> = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newConfig: LiveConfig = {
        ...config,
        systemInstruction: {
          parts: [{ text: event.target.value }],
        },
      };
      setConfig(newConfig);
    },
    [config, setConfig]
  );

  const updateFunctionDescription = useCallback(
    (editedFdName: string, newDescription: string) => {
      const newConfig: LiveConfig = {
        ...config,
        tools:
          config.tools?.map((tool) => {
            const fdTool = tool as FunctionDeclarationsTool;
            if (!Array.isArray(fdTool.functionDeclarations)) {
              return tool;
            }
            return {
              ...tool,
              functionDeclarations: fdTool.functionDeclarations.map((fd) =>
                fd.name === editedFdName
                  ? { ...fd, description: newDescription }
                  : fd
              ),
            };
          }) || [],
      };
      setConfig(newConfig);
    },
    [config, setConfig]
  );

  return (
    <div className="settings-dialog">
      <button
        className="action-button material-symbols-outlined"
        onClick={() => setOpen(!open)}
        aria-label="Settings"
      >
        settings
      </button>
      <dialog className="dialog" ref={dialogRef} onClose={() => setOpen(false)}>
        <div className="dialog-header">
          <h3>Settings</h3>
          <button 
            className="close-button material-symbols-outlined" 
            onClick={() => setOpen(false)}
            aria-label="Close settings"
          >
            close
          </button>
        </div>
        
        <div className={`dialog-container ${connected ? "disabled" : ""}`}>
          {connected && (
            <div className="connected-indicator">
              <p>
                These settings can only be applied before connecting and will
                override other settings.
              </p>
            </div>
          )}
          
          <div className="settings-section">
            <div className="mode-selectors-container">
              <div className="selector-group">
                <label className="settings-label">Response modality</label>
                <ResponseModalitySelector />
              </div>
              
              <div className="selector-group">
                <label className="settings-label">Voice</label>
                <VoiceSelector />
              </div>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">System Instructions</label>
            <textarea
              className="system"
              onChange={updateConfig}
              value={systemInstruction}
              placeholder="Enter system instructions here..."
            />
          </div>
          
          <div className="settings-section">
            <label className="settings-label">Function declarations</label>
            <div className="function-declarations">
              <div className="fd-rows">
                {functionDeclarations.map((fd, fdKey) => (
                  <div className="fd-row" key={`function-${fdKey}`}>
                    <span className="fd-row-name">{fd.name}</span>
                    <span className="fd-row-args">
                      {Object.keys(fd.parameters?.properties || {}).map(
                        (item, k) => (
                          <span key={k}>{item}</span>
                        )
                      )}
                    </span>
                    <input
                      key={`fd-${fd.description}`}
                      className="fd-row-description"
                      type="text"
                      defaultValue={fd.description}
                      onBlur={(e) =>
                        updateFunctionDescription(fd.name, e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
