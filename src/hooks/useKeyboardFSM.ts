import { useEffect, useRef } from "react";

type State = "global" | "search" | "suggestions" | "blocks";

type FSMAction = (e: KeyboardEvent, ctx: any) => void;

type FSMRule =
  | { next?: State; action?: FSMAction }
  | FSMAction;

type FSM = Record<State, Record<string, FSMRule>>;

interface Props {
  state: State;
  setState: (s: State) => void;
  fsm: FSM;
  getContext: () => any;
  inputRef?: React.RefObject<HTMLElement>;
}

export function useKeyboardFSM({
  state,
  setState,
  fsm,
  getContext,
  inputRef,
}: Props) {
  const stateRef = useRef(state);
  const ctxRef = useRef<any>(null);

  // keep latest state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // keep latest context
  useEffect(() => {
    ctxRef.current = getContext();
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const currentState = stateRef.current;
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
        }, 0);

        // unfocus search input if focused
        if (inputRef?.current) {
          inputRef.current.blur();
        }

        return;
      }

      // Normalize key
      const key = e.key === " " ? "Space" : e.key;

      const stateMap = fsm[currentState];
      const rule = stateMap?.[key];

      const ctx = ctxRef.current;

      // 1. FSM rule exists
      if (rule) {
        e.preventDefault();

        if (typeof rule === "function") {
          rule(e, ctx);
          return;
        }

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
