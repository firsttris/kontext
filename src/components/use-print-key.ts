/** Ctrl+P (Cmd+P) runs `print`: the page's own printout instead of the whole app around it. */
import { useEffect, useRef } from "react";

export const usePrintKey = (print: () => void) => {
  const printRef = useRef(print);
  printRef.current = print;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
};
