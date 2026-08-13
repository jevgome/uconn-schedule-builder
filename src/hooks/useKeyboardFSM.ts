import { useEffect, useRef, useState } from "react";

export type State = "global" | "search" | "suggestions" | "blocks" | "schedules" | "popup";

export type FSMRule = {
  next?: State;
  action?: (event: any, ctx: any) => void;
};

export type FSM = Record<State, Record<string, FSMRule>>;

type Props = {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  fsm: FSM;
  state: State;
  setState: (s: State) => void;
  getContext: () => any;
};

export function useKeyboardFSM({
  state,
  setState,
  fsm,
  getContext,
  inputRef,
}: Props) {
  const stateRef = useRef<State>(state);
  const ctxRef = useRef<any>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // keep latest state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // keep latest context
  useEffect(() => {
    ctxRef.current = getContext();
  });

  useEffect(() => {
    if (state !== "blocks") {
      setLastKey(null);
    }
  }, [state]);

  useEffect(() => {
    if (!lastKey) return;

    const t = setTimeout(() => setLastKey(null), 600);
    return () => clearTimeout(t);
  }, [lastKey]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key === " " ? "Space" : e.key;
      const alwaysEnabledKeys = new Set([
        "Enter",
        "ArrowUp",
        "ArrowDown",
      ]);

      const ctx = ctxRef.current;

      const alwaysAllow =
        alwaysEnabledKeys.has(e.key) || alwaysEnabledKeys.has(key);

      if (!ctx.vimMode && !alwaysAllow) return;

      stateRef.current = state;

      const currentState: State = stateRef.current;

      const stateMap: Record<string, FSMRule> =
        fsm[currentState] as Record<string, FSMRule>;

      const rule: FSMRule | undefined = stateMap[key];

      if (e.key === "Tab") {
        e.preventDefault();
      }

      const isTyping =
        inputRef?.current &&
        document.activeElement === inputRef.current;

      const isCtrlBracket = e.key === "[" && e.ctrlKey;

      if (e.key === "Escape" || isCtrlBracket) {
        e.preventDefault();

        setState("global");
        setTimeout(() => {
          const ctx = getContext();
          if (ctx.setSuggestions) ctx.setSuggestions([]);
          if (ctx.setSelectedSuggestion) ctx.setSelectedSuggestion(0);
          if (ctx.setHoverSchedule) ctx.setHoverSchedule(null);
          ctx.setSelectedBlockIndex(null);
          ctx.setHoveredSection(null);
        }, 0);

        // unfocus search input if focused
        if (inputRef?.current) {
          inputRef.current.blur();
        }

        return;
      }

      // 1. FSM rule exists
      if (rule) {
        e.preventDefault();

        rule.action?.(e, ctx);
        if (rule.next) setState(rule.next);

        return;
      }

      // 2. suggestions fallback: typing exits to search
      if (currentState === "suggestions") {
        const isPrintable =
          e.key.length === 1 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey;

        if (isPrintable) {
          e.preventDefault();
          setState("search");

          setTimeout(() => {
            inputRef?.current?.focus();
          }, 0);

          return;
        }
      }

      // dd detection
      if (state === "blocks") {
        if (lastKey === "d" && key === "d") {
          ctx.clearBlocks();
          ctx.setSelectedBlockIndex(0);
          setLastKey(null);
          return;
        }

        setLastKey(key);
      }

      // 3. search mode restrictions (only when typing)
      if (isTyping && currentState === "search") {
        const allowed = ["Enter", "ArrowDown", "ArrowUp", "Tab"];
        if (!allowed.includes(e.key)) return;
      }
    };

    // single stable listener (capture phase for reliability)
    window.addEventListener("keydown", handler, true);

    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [fsm, setState, inputRef]);
}
