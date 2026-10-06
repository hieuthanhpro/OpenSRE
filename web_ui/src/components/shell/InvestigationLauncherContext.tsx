'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type InvestigationLauncherValue = {
  open: (prompt?: string | unknown) => void;
  close: () => void;
  isOpen: boolean;
  initialPrompt?: string;
  /** Register a page-level completion handler; cleanup on unmount. */
  registerOnComplete: (fn: () => void) => () => void;
  /** Invoked by AppShell when a drawer run finishes. */
  onComplete: () => void;
};

const InvestigationLauncherContext =
  createContext<InvestigationLauncherValue | null>(null);

export function InvestigationLauncherProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const onCompleteRef = useRef<(() => void) | null>(null);

  const open = useCallback((prompt?: unknown) => {
    if (typeof prompt === 'string') {
      setInitialPrompt(prompt);
    } else {
      setInitialPrompt(undefined);
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialPrompt(undefined);
  }, []);

  const registerOnComplete = useCallback((fn: () => void) => {
    onCompleteRef.current = fn;
    return () => {
      if (onCompleteRef.current === fn) {
        onCompleteRef.current = null;
      }
    };
  }, []);

  const onComplete = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  return (
    <InvestigationLauncherContext.Provider
      value={{ open, close, isOpen, initialPrompt, registerOnComplete, onComplete }}
    >
      {children}
    </InvestigationLauncherContext.Provider>
  );
}

export function useInvestigationLauncher(): InvestigationLauncherValue {
  const ctx = useContext(InvestigationLauncherContext);
  if (!ctx) {
    throw new Error(
      'useInvestigationLauncher must be used within InvestigationLauncherProvider',
    );
  }
  return ctx;
}
